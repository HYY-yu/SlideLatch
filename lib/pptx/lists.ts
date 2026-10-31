import { parseMark } from './dsl.ts';
import { boxFor, point, worldFrame } from './geometry.ts';
import type { Box, Patches, SourceNode } from './types';
export type ListItem={index:number;roots:SourceNode[];nodes:SourceNode[];box:Box};
export type SlideList={key:string;index:number;color:string;items:ListItem[];controller:SourceNode;dynamic:boolean;min:number;max:number;grouped:boolean;box:Box};
/** Display-only compatibility: tolerate both @1@1 文本 and @1@1 @文本. */
export function listNodeLabel(name:string):string {
 return name.trim().replace(/^@\d+@\d+(?:\[\d+(?:-\d+)?\])?\s*/, '').replace(/^@/, '').trim();
}
export function listItemNodes(item:ListItem):SourceNode[]{
 // The item heading represents its root group; keep actual content nodes visible.
 return item.nodes.filter(n=>!item.roots.some(root=>root.key===n.key&&root.kind==='grpSp'));
}
const colors=['#72bfae','#b49ada','#d5b375','#7caed8','#d58eaa'];
function bounds(boxes:Box[]):Box {
 const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
 return {x,y,width:Math.max(...boxes.map(b=>b.x+b.width))-x,height:Math.max(...boxes.map(b=>b.y+b.height))-y};
}
function worldBox(n:SourceNode,nodes:SourceNode[],patches:Patches):Box|null{
 const b=boxFor(n,patches);if(!b)return null;const m=worldFrame(n,nodes,patches);
 const corners=[[0,0],[b.width,0],[0,b.height],[b.width,b.height]].map(([x,y])=>point(m,x,y));
 return bounds(corners.map(p=>({...p,width:0,height:0})));
}
/** Derive semantic lists without changing source nodes or export patches. */
export function slideLists(nodes:SourceNode[],patches:Patches):SlideList[]{
 const grouped=new Map<number,Map<number,SourceNode[]>>();
 for(const n of nodes){const name=(patches[n.key]?.name??n.name).trim(),m=/^@(\d+)@(\d+)/.exec(name);if(!m)continue;
 const items=grouped.get(+m[1])??new Map<number,SourceNode[]>();items.set(+m[2],[...(items.get(+m[2])??[]),n]);grouped.set(+m[1],items);}
 const result:SlideList[]=[];
 for(const [index,entries]of [...grouped].sort(([a],[b])=>a-b)){
 const items:ListItem[]=[];
 for(const [item,candidates]of [...entries].sort(([a],[b])=>a-b)){
 const candidateIds=new Set(candidates.map(n=>n.id));
 const roots=candidates.filter(n=>{
   let parent=n.parentId;
   while(parent){if(candidateIds.has(parent))return false;parent=nodes.find(p=>p.id===parent)?.parentId??null;}
   return true;
 });
 const ids=new Set(roots.map(n=>n.id));let changed=true;
 while(changed){changed=false;for(const n of nodes)if(n.parentId&&ids.has(n.parentId)&&!ids.has(n.id)){ids.add(n.id);changed=true;}}
 const boxes=roots.map(n=>worldBox(n,nodes,patches)).filter((b):b is Box=>!!b);if(!boxes.length)continue;
 items.push({index:item,roots,nodes:nodes.filter(n=>ids.has(n.id)),box:bounds(boxes)});
 }
 if(!items.length)continue;
 const controller=items[0].roots[0],mark=parseMark(patches[controller.key]?.name??controller.name),isGrouped=items.every(i=>i.roots.length===1&&i.roots[0].kind==='grpSp');
 result.push({key:`${controller.slidePath}:list:${index}`,index,color:colors[result.length%colors.length],items,controller,grouped:isGrouped,dynamic:isGrouped&&mark.dynamic,min:mark.dynamic?mark.min:items.length,max:mark.dynamic?mark.max:items.length,box:bounds(items.map(i=>i.box))});
 }
 return result;
}
export function listPreviewCount(list:SlideList,previews:Record<string,number>):number{
 return list.dynamic?Math.max(list.min,Math.min(list.max,previews[list.key]??list.items.length)):list.items.length;
}
