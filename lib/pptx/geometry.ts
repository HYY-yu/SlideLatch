import type { Box, Patches, SourceNode } from './types';
export type Matrix = [number,number,number,number,number,number];
export const identity: Matrix = [1,0,0,1,0,0];
export function multiply(a: Matrix,b: Matrix): Matrix { return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]]; }
export function inverse(m: Matrix): Matrix {
  const d=m[0]*m[3]-m[1]*m[2]; if(Math.abs(d)<1e-10)throw new Error('GEOMETRY_SINGULAR');
  return [m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,(m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d];
}
export const point=(m:Matrix,x:number,y:number)=>({x:m[0]*x+m[2]*y+m[4],y:m[1]*x+m[3]*y+m[5]});
export const translate=(x:number,y:number):Matrix=>[1,0,0,1,x,y];
export const scale=(x:number,y:number):Matrix=>[x,0,0,y,0,0];
export const boxFor=(node:SourceNode,patches:Patches):Box|null=>patches[node.key]?.box || node.box;
export function frame(node:SourceNode,box:Box):Matrix {
  const a=node.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  const rotate:Matrix=[c,s,-s,c,0,0];
  return multiply(translate(box.x+box.width/2,box.y+box.height/2),multiply(rotate,multiply(scale(node.flipH?-1:1,node.flipV?-1:1),translate(-box.width/2,-box.height/2))));
}
export function groupContent(node:SourceNode,box:Box):Matrix {
  const ch=node.childBox;
  return ch?multiply(scale(ch.width?box.width/ch.width:1,ch.height?box.height/ch.height:1),translate(-ch.x,-ch.y)):identity;
}
export function parentMatrix(node:SourceNode,nodes:SourceNode[],patches:Patches):Matrix {
  if(!node.parentId)return identity;
  const parent=nodes.find(n=>n.id===node.parentId); if(!parent)throw new Error('GEOMETRY_PARENT');
  const b=boxFor(parent,patches); if(!b)throw new Error('GEOMETRY_PARENT_BOX');
  return multiply(parentMatrix(parent,nodes,patches),multiply(frame(parent,b),groupContent(parent,b)));
}
export function worldFrame(node:SourceNode,nodes:SourceNode[],patches:Patches):Matrix {
  const box=boxFor(node,patches);if(!box)return identity;
  return multiply(parentMatrix(node,nodes,patches),frame(node,box));
}
export function matrixString(m:Matrix) {return `matrix(${m.join(' ')})`;}
