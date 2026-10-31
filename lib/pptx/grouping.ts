import { boxFor, point, worldFrame } from './geometry.ts';
import type { Box, GroupMember, LoadedTemplate, NativeGroup, Patches, RenderElement, SourceNode } from './types';
import type { SlideList } from './lists.ts';
function memberFrame(n:SourceNode,nodes:SourceNode[],patches:Patches):GroupMember{
 const b=boxFor(n,patches);if(!b)throw new Error('GROUP_MISSING_GEOMETRY');
 const m=worldFrame(n,nodes,patches),sx=Math.hypot(m[0],m[1]),sy=Math.hypot(m[2],m[3]);
 if(sx<1e-8||sy<1e-8||Math.abs(m[0]*m[2]+m[1]*m[3])>1e-6*sx*sy)throw new Error('GROUP_UNSUPPORTED_TRANSFORM');
 const center=point(m,b.width/2,b.height/2),width=b.width*sx,height=b.height*sy;
 return {key:n.key,box:{x:center.x-width/2,y:center.y-height/2,width,height},rotation:Math.atan2(m[1],m[0])*180/Math.PI,flipH:false,flipV:m[0]*m[3]-m[1]*m[2]<0};
}
function groupBounds(members:GroupMember[]):Box{
 const points=members.flatMap(m=>{const a=m.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),b=m.box;return [[-1,-1],[1,-1],[-1,1],[1,1]].map(([x,y])=>({x:b.x+b.width/2+c*x*b.width/2-s*y*b.height/2,y:b.y+b.height/2+s*x*b.width/2+c*y*b.height/2}));});
 const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));
 return {x,y,width:Math.max(1,Math.max(...points.map(p=>p.x))-x),height:Math.max(1,Math.max(...points.map(p=>p.y))-y)};
}
/** Snapshot page-space transforms; changes remain undoable patches until export. */
export function editListMembers(model:LoadedTemplate,page:number,list:SlideList,itemIndex:number,keys:string[],patches:Patches):{patches:Patches;selected:string}{
 const nodes=model.slides[page].nodes,next: Patches={...patches};
 if(list.items.some((item,i)=>item.index!==i+1))throw new Error('GROUP_ITEM_SEQUENCE');
 if(!keys.length)throw new Error('GROUP_EMPTY');
 let nextId=Math.max(...nodes.map(n=>Number(n.id)))+1,selected='';
 for(const item of list.items){
   if(list.grouped&&item.index!==itemIndex)continue;
   const existing=item.roots.length===1&&item.roots[0].kind==='grpSp'?item.roots[0]:undefined;
   if(existing?.parentId)throw new Error('GROUP_NESTED_ITEM');
   const oldKeys=existing?nodes.filter(n=>n.parentId===existing.id).map(n=>n.key):item.roots.map(n=>n.key);
   const chosen=item.index===itemIndex?keys:oldKeys;
   const key=existing?.key??`${model.slides[page].path}#${nextId++}`;
   const selectedNodes=chosen.map(k=>{const n=nodes.find(n=>n.key===k);if(!n||n.dataKind||n.key===key||n.parentId&&n.parentId!==existing?.id)throw new Error('GROUP_MEMBER_NOT_AVAILABLE');return n;});
   const members=selectedNodes.map(n=>memberFrame(n,nodes,patches));
   const releasedKeys=[...new Set([...oldKeys,...(patches[key]?.group?.released.map(m=>m.key)??[])])].filter(k=>!chosen.includes(k));
   const released=releasedKeys.map(k=>memberFrame(nodes.find(n=>n.key===k)!,nodes,patches));
   const group:NativeGroup={box:groupBounds(members),members,released};
   for(const m of [...members,...released]){
     const n=nodes.find(n=>n.key===m.key)!,patch={...next[m.key]};delete patch.box;
     const name=patch.name??n.name;
     if(/^@\d+@\d+/.test(name))patch.name='@'+name.replace(/^@\d+@\d+(?:\[\d+(?:-\d+)?\])?\s*@?/, '');
     next[m.key]=patch;
   }
   const existingName=existing?(next[key]?.name??existing.name).trim():'';
   const groupPatch={...next[key],group,name:/^@\d+@\d+(?:\[\d+(?:-\d+)?\])?$/.test(existingName)?existingName:`@${list.index}@${item.index}`};delete groupPatch.box;
   next[key]=groupPatch;if(item.index===itemIndex)selected=key;
 }
 return {patches:next,selected};
}
/** Materialize groups in the SVG model while preserving the original ZIP as export authority. */
export function groupedModel(base:LoadedTemplate,patches:Patches):LoadedTemplate{
 if(!Object.values(patches).some(p=>p.group))return base;
 const slides=base.slides.map(s=>({...s,nodes:s.nodes.map(n=>({...n,children:[...n.children]}))}));
 const affected=new Set(Object.entries(patches).filter(([,p])=>p.group).map(([key])=>key.slice(0,key.lastIndexOf('#'))));
 const deck={...base.deck,slides:base.deck.slides.map((s,i)=>affected.has(base.slides[i].path)?{...s,elements:structuredClone(s.elements)}:s)};
 for(const [key,patch]of Object.entries(patches)){
  if(!patch.group)continue;const g=patch.group,page=slides.findIndex(s=>s.path===key.slice(0,key.lastIndexOf('#')));if(page<0)throw new Error('GROUP_SLIDE');
  const nodes=slides[page].nodes,id=key.slice(key.lastIndexOf('#')+1),elements=deck.slides[page].elements;
  function take(list:RenderElement[],target:string):RenderElement|undefined{const i=list.findIndex(e=>String(e.id)===target);if(i>=0)return list.splice(i,1)[0];for(const e of list){const found=e.elements&&take(e.elements,target);if(found)return found;}}
  const oldNode=nodes.find(n=>n.key===key),oldRender=take(elements,id);
  const root:SourceNode=oldNode??{key,id,slidePath:slides[page].path,name:patch.name??'',kind:'grpSp',parentId:null,children:[],box:g.box,childBox:g.box,rotation:0,flipH:false,flipV:false,text:'',marked:true};
  Object.assign(root,{box:g.box,childBox:g.box,rotation:0,flipH:false,flipV:false,children:g.members.map(m=>m.key.slice(m.key.lastIndexOf('#')+1))});if(!oldNode)nodes.push(root);
  // Detach the former children before rebuilding membership, retaining their render objects.
  const former=new Map<string,RenderElement>();
  const collect=(es:RenderElement[])=>{for(const e of es){former.set(String(e.id),e);if(e.elements)collect(e.elements)}};if(oldRender?.elements)collect(oldRender.elements);
  const memberElements:RenderElement[]=[];
  for(const m of [...g.members,...g.released]){
   const n=nodes.find(n=>n.key===m.key);if(!n)throw new Error('GROUP_MEMBER_MISSING');
   const memberId=n.id,e=take(elements,memberId)??former.get(memberId);if(!e)throw new Error('GROUP_RENDER_MISSING');
   const inGroup=g.members.some(v=>v.key===m.key);Object.assign(n,{...m,key:m.key,parentId:inGroup?id:null});
   Object.assign(e,{left:m.box.x,top:m.box.y,width:m.box.width,height:m.box.height,rotate:m.rotation,isFlipH:m.flipH,isFlipV:m.flipV});
   if(inGroup)memberElements.push(e);else elements.push(e);
  }
  elements.push({...oldRender,id,type:'group',left:g.box.x,top:g.box.y,width:g.box.width,height:g.box.height,rotate:0,isFlipH:false,isFlipV:false,elements:memberElements,order:oldRender?.order??Math.min(...memberElements.map(e=>Number(e.order??0)))});
 }
 // Rebuild ancestry after members have moved.
 for(const s of slides){for(const n of s.nodes)n.children=[];for(const n of s.nodes)if(n.parentId)s.nodes.find(p=>p.id===n.parentId)?.children.push(n.id);}
 return {...base,slides,deck};
}
