'use client';
import type { RefObject } from 'react';
import type { Patches, SourceNode } from '@/lib/pptx/types';
import { listItemNodes, listNodeLabel, type SlideList } from '@/lib/pptx/lists';
export default function ListObjects({nodes,lists,patches,selected,markedOnly,onSelect,onSelectItem,selectedRef,locale}:{nodes:SourceNode[];lists:SlideList[];patches:Patches;selected:string|null;markedOnly:boolean;onSelect:(key:string)=>void;onSelectItem:(key:string)=>void;selectedRef:RefObject<HTMLButtonElement|null>;locale:'zh'|'en'}){
 const zh=locale==='zh',members=new Set(lists.flatMap(l=>l.items.flatMap(i=>i.nodes.map(n=>n.key))));
 const row=(n:SourceNode,inList=false)=>{
 const name=patches[n.key]?.name??n.name;if(markedOnly&&!name.startsWith('@')&&selected!==n.key)return null;
 return <button key={n.key} ref={selected===n.key?selectedRef:undefined} aria-pressed={selected===n.key} onClick={()=>onSelect(n.key)} title={inList?(listNodeLabel(name)||n.text||(zh?'内容':'Content')):name}><span className="object-kind">{n.kind==='grpSp'?'▧':n.kind==='pic'?'▨':n.kind==='graphicFrame'?'▤':'T'}</span><span>{inList?(listNodeLabel(name)||n.text||(zh?'内容':'Content')):name}</span></button>;
 };
 return <>{nodes.filter(n=>!members.has(n.key)).map(n=>row(n))}{lists.map((list,i)=><details key={list.key} className="pptx-list-tree" style={{borderColor:list.color+'55'}} open><summary><button onClick={()=>onSelectItem(list.controller.key)}>{zh?'列表':'List'} {String.fromCharCode(65+i)} <small>{list.dynamic?`${zh?'可变':'Flexible'} ${list.min}–${list.max}`:`${zh?'固定':'Fixed'} ${list.items.length}`}</small></button></summary>{list.items.map(item=><details key={item.index} open><summary><button ref={item.roots.some(n=>n.key===selected&&n.kind==='grpSp')?selectedRef:undefined} aria-pressed={item.roots.some(n=>n.key===selected&&n.kind==='grpSp')} onClick={()=>onSelectItem(item.roots[0].key)}>{zh?'第':'Item'} {item.index}{zh?' 项':''}</button></summary>{listItemNodes(item).map(n=>row(n,true))}</details>)}</details>)}</>;
}
