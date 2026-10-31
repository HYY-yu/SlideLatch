import { markError, parseMark } from './dsl.ts';
import { allowedMarkTypes } from './marking.ts';
import type { Patches, SourceNode, SourceSlide } from './types';

/** Validate the marking structure before export; generation still uses the full DSL compiler. */
export function validateWorkspace(slides:SourceSlide[],patches:Patches):string[]{
  const issues:string[]=[];
  for(const [i,slide]of slides.entries()){
    const nameOf=(n:SourceNode)=>patches[n.key]?.name??n.name;
    const report=(id:string,reason:string)=>issues.push(`${i+1} / ${id}: ${reason}`);
    const lists=new Map<number,{groups:SourceNode[];flat:Map<number,SourceNode[]>}>();
    for(const node of slide.nodes){
      const name=nameOf(node).trim();if(!name.startsWith('@'))continue;
      const mark=parseMark(name);
      if(mark.type==='raw'||markError(mark)){report(node.id,name);continue;}
      if(!allowedMarkTypes(node).includes(mark.type as ReturnType<typeof allowedMarkTypes>[number]))report(node.id,'MARK_TYPE_MISMATCH');
      if(mark.type==='group'){
        if(node.kind!=='grpSp')report(node.id,'GROUP_REQUIRED');
        const list=lists.get(mark.index)||{groups:[] as SourceNode[],flat:new Map<number,SourceNode[]>()};list.groups.push(node);lists.set(mark.index,list);
      }else{
        const prefix=/^@(\d+)@(\d+)\s*/.exec(name);
        if(prefix){const list=lists.get(+prefix[1])||{groups:[] as SourceNode[],flat:new Map<number,SourceNode[]>()};list.flat.set(+prefix[2],[...(list.flat.get(+prefix[2])||[]),node]);lists.set(+prefix[1],list);}
        if((mark.type==='chart'||mark.type==='table')&&(node.kind!=='graphicFrame'||node.parentId||prefix))report(node.id,'PAGE_DATA_COMPONENT_REQUIRED');
        if(mark.type==='background'&&(node.parentId||prefix))report(node.id,'PAGE_BACKGROUND_REQUIRED');
        if(mark.type==='text'&&!/\[\d+(?:-\d+)?\]/.test(name)&&!prefix&&!node.parentId)report(node.id,'TEXT_RANGE_REQUIRED');
      }
    }
    function compareComponents(first:SourceNode[],others:SourceNode[],id:string){
      const count=(nodes:SourceNode[])=>{
        const result:Record<string,number>={};for(const n of nodes){const type=parseMark(nameOf(n)).type;if(type!=='fixed'&&type!=='group'){result[type]=(result[type]||0)+1;}}
        return Object.entries(result).sort().map(([k,v])=>`${k}:${v}`).join(',');
      };
      if(count(first)!==count(others))report(id,'ITEM_COMPONENTS_MISMATCH');
    }
    for(const [index,list]of lists){
      if(list.groups.length&&list.flat.size){report(String(index),'MIXED_LIST_STRUCTURE');continue;}
      if(list.groups.length){
        const groups=[...list.groups].sort((a,b)=>parseMark(nameOf(a)).item-parseMark(nameOf(b)).item);
        groups.forEach((g,n)=>{if(parseMark(nameOf(g)).item!==n+1)report(g.id,'ITEM_SEQUENCE');});
        const first=parseMark(nameOf(groups[0]));
        if(first.dynamic&&(groups.length<first.min||groups.length>first.max))report(groups[0].id,'ITEM_RANGE');
        const components=(group:SourceNode)=>slide.nodes.filter(n=>n.parentId===group.id);
        for(const group of groups.slice(1)){
          if(parseMark(nameOf(group)).dynamic)report(group.id,'ONLY_FIRST_ITEM_RANGE');
          compareComponents(components(groups[0]),components(group),group.id);
        }
      }else{
        const items=[...list.flat.keys()].sort((a,b)=>a-b);
        items.forEach((item,n)=>{if(item!==n+1)report(String(index),'ITEM_SEQUENCE');});
        const first=list.flat.get(1);if(first)for(const item of items.slice(1))compareComponents(first,list.flat.get(item)!,String(index));
      }
    }
  }
  return issues;
}
