'use client';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { Locale } from '@/lib/i18n';
import { dismissDialogOnBackdrop } from '@/lib/dialog';
import {track,trackOnce} from '@/lib/analytics/browser';
import templateZh from '@/lib/demo/template.json';
import templateEn from '@/lib/demo/template.en.json';
import { editorCopy } from '@/lib/pptx/copy';
import { loadTemplate } from '@/lib/pptx/load';
import { writePptx } from '@/lib/pptx/xml';
import { validateWorkspace } from '@/lib/pptx/validation';
import { boxFor, inverse, parentMatrix, point, worldFrame } from '@/lib/pptx/geometry';
import { markError, markName, parseMark, type Mark } from '@/lib/pptx/dsl';
import type { Box, LoadedTemplate, Patches, SourceNode } from '@/lib/pptx/types';
import SvgSlide from './pptx/svg-slide';
import WorkflowController from './pptx/workflow-controller';
import StudioShell from './studio/studio-shell';
import { locateAuthorIssue } from '@/lib/workflow/studio-issue';
import type { BoundaryProbe } from '@/lib/workflow/session';
import ListObjects from './pptx/list-objects';
import ListSettings from './pptx/list-settings';
import { groupedModel, editListMembers } from '@/lib/pptx/grouping';
import { slideLists, listPreviewCount } from '@/lib/pptx/lists';
import { uniqueNodeContent, previewText } from '@/lib/pptx/text-preview';
import TextLengthControls from './pptx/text-length-controls';
import { historyShortcut } from '@/lib/pptx/shortcuts';
import { addedMarkName, allowedMarkTypes, removedMarkName } from '@/lib/pptx/marking';

const emptyHistory={past:[] as Patches[],current:{} as Patches,future:[] as Patches[]};
export default function TemplateDemo({locale,mode='demo'}:{locale:Locale;mode?:'demo'|'studio'}) {
  const t=editorCopy[locale],template=locale==='en'?templateEn:templateZh;
  const [baseModel,setModel]=useState<LoadedTemplate|null>(null),[phase,setPhase]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const [page,setPage]=useState(0),[selected,setSelected]=useState<string|null>(null),[markedOnly,setMarkedOnly]=useState(false);
  const [history,setHistory]=useState(emptyHistory),[transient,setTransient]=useState<Patches|null>(null);
  const model=useMemo(()=>baseModel?groupedModel(baseModel,history.current):null,[baseModel,history.current]);
  const [selectionKind,setSelectionKind]=useState<'node'|'item'>('node');
  const [groupMode,setGroupMode]=useState<{listKey:string;item:number;keys:string[]}|null>(null);
  const [nameDraft,setNameDraft]=useState(''),[exporting,setExporting]=useState(false),[download,setDownload]=useState<string|null>(null);
  const [exportReport,setExportReport]=useState('');
  const [fileName,setFileName]=useState(''),[fileSession,setFileSession]=useState(0);
  const inputRef=useRef<HTMLInputElement>(null),loadVersion=useRef(0);
  const outputName=(fileName||'slidelatch-template.pptx').replace(/\.pptx$/i,'')+'-marked.pptx';
  const [previewLengths,setPreviewLengths]=useState<Record<string,number>>({});
  const [contentDraft,setContentDraft]=useState<{key:string;value:string}|null>(null);
  const svgRef=useRef<SVGSVGElement>(null),overviewRef=useRef<HTMLDialogElement>(null),exportDialogRef=useRef<HTMLDialogElement>(null),downloadRef=useRef<string|null>(null);
  const objectListRef=useRef<HTMLDivElement>(null),selectedObjectRef=useRef<HTMLButtonElement>(null);
  const [listPreviews,setListPreviews]=useState<Record<string,number>>({});
  const [workflowPreview,setWorkflowPreview]=useState<BoundaryProbe|null>(null);
  const [capacityPreview,setCapacityPreview]=useState<{key:string;text:string}|null>(null);
  const patches=transient||history.current;
  const source=model?.slides[page];
  const node=source?.nodes.find(node=>node.key===selected);
  const lists=useMemo(()=>slideLists(source?.nodes??[],patches),[source,patches]);
  const selectedList=lists.find(list=>list.items.some(item=>item.nodes.some(n=>n.key===selected)));
  const isListItem=selectionKind==='item'||!!node&&!!selectedList&&node.kind==='grpSp'&&selectedList.items.some(item=>item.roots.some(root=>root.key===node.key));
  function updateList(change:{dynamic?:boolean;min?:number;max?:number}){
    if(!selectedList)return;
    if(!selectedList.grouped&&model){
      try{
        const item=selectedList.items[0],result=editListMembers(model,page,selectedList,item.index,item.roots.map(n=>n.key),history.current);
        const first=result.selected,name=`@${selectedList.index}@1${change.dynamic?`[${selectedList.items.length}-${selectedList.items.length}]`:''}`;
        commit({...result.patches,[first]:{...result.patches[first],name}});setSelected(first);
      }catch(cause){console.error('[SlideLatch] template.group.failed',cause);setError(locale==='zh'?'无法创建组合，请检查所选对象。':'Could not create the group. Check the selected objects.');}
      return;
    }
    const list=selectedList,first=list.controller,old=parseMark(history.current[first.key]?.name??first.name);
    // Keep the original item structure intact; only change the first item's DSL range.
    const min=Math.min(list.items.length,Math.max(1,change.min??list.min));
    const max=Math.max(list.items.length,min,change.max??list.max);
    const name=markName({...old,dynamic:change.dynamic??list.dynamic,min,max},first.name,true);
    commit({...history.current,[first.key]:{...history.current[first.key],name}});
  }
  const editingList=lists.find(list=>list.key===groupMode?.listKey);
  const editingItem=editingList?.items.find(item=>item.index===groupMode?.item);
  const editableMembers=source?.nodes.filter(n=>!n.dataKind&&!!n.box&&n.key!==editingItem?.roots[0].key&&(!n.parentId||editingItem?.roots.some(root=>root.kind==='grpSp'&&root.id===n.parentId))&&!lists.some(list=>list.items.some(item=>item!==editingItem&&item.nodes.some(member=>member.key===n.key))))??[];
  // Flat item roots are content objects; include them rather than excluding a presumed group root.
  if(editingItem?.roots[0].kind!=='grpSp'&&editingItem?.roots[0].box&&!editableMembers.includes(editingItem.roots[0]))editableMembers.unshift(editingItem.roots[0]);
  function startGrouping(){
    if(!selectedList||!source)return;
    const item=selectedList.items.find(item=>item.nodes.some(n=>n.key===selected))??selectedList.items[0];
    const keys=item.roots.length===1&&item.roots[0].kind==='grpSp'?source.nodes.filter(n=>n.parentId===item.roots[0].id).map(n=>n.key):item.roots.map(n=>n.key);
    setGroupMode({listKey:selectedList.key,item:item.index,keys});setError('');
  }
  function selectObject(key:string|null){
    if(!groupMode){setWorkflowPreview(null);setSelectionKind('node');setSelected(key);return;}
    if(!key||!editableMembers.some(n=>n.key===key))return;
    setGroupMode(state=>state?{...state,keys:state.keys.includes(key)?state.keys.filter(k=>k!==key):[...state.keys,key]}:null);
  }
  function selectListItem(key:string){if(groupMode){selectObject(key);return;}setSelectionKind('item');setSelected(key);}
  function saveGrouping(){
    if(!model||!editingList||!groupMode)return;
    try{
      const result=editListMembers(model,page,editingList,groupMode.item,groupMode.keys,history.current);
      commit(result.patches);setSelected(result.selected);setGroupMode(null);setError('');
      console.info('[SlideLatch] template.group.updated',{slide:page+1,item:groupMode.item,members:groupMode.keys.length});
    }catch(cause){console.error('[SlideLatch] template.group.failed',cause);setError(locale==='zh'?'组合失败：所选对象的层级或变换暂不支持，修改仍保留。':'Grouping failed: the selected hierarchy or transform is unsupported. Your changes are preserved.');}
  }
  function previewList(key:string,count:number){setListPreviews(state=>({...state,[key]:count}));}
  const markTypes=node?allowedMarkTypes(node):[];
  const currentName=node?(history.current[node.key]?.name??node.name):'';
  const currentContent=node?(history.current[node.key]?.text??uniqueNodeContent(node.text)):'';
  const nodeContent=node&&contentDraft?.key===node.key?contentDraft.value:currentContent;
  const contentDirty=!!node&&nodeContent!==currentContent;
  const textPreviews=useMemo(()=>{
    const result:Record<string,string>={};
    for(const slide of model?.slides||[])for(const n of slide.nodes){
      const edited=contentDraft?.key===n.key?contentDraft.value:history.current[n.key]?.text;
      const content=edited??uniqueNodeContent(n.text);
      if(previewLengths[n.key]!==undefined)result[n.key]=previewText(content,previewLengths[n.key]);
      else if(edited!==undefined)result[n.key]=edited;
    }
    if(workflowPreview?.kind==='text')result[workflowPreview.key]=workflowPreview.text??'';
    if(capacityPreview)result[capacityPreview.key]=capacityPreview.text;
    return result;
  },[model,previewLengths,history.current,contentDraft,workflowPreview,capacityPreview]);
  const mark=parseMark(nameDraft),draftInvalid=markError(mark);
  const hasMark=currentName.trim().startsWith('@');
  useEffect(()=>setNameDraft(currentName),[selected,currentName]);
  useEffect(()=>{
    const list=objectListRef.current,row=selectedObjectRef.current;
    if(!list||!row)return;
    // Scroll only the object list; selecting a canvas object must not move the page.
    let ancestor=row.parentElement;while(ancestor&&ancestor!==list){if(ancestor instanceof HTMLDetailsElement)ancestor.open=true;ancestor=ancestor.parentElement;}
    const bounds=list.getBoundingClientRect(),item=row.getBoundingClientRect();
    if(item.top<bounds.top)list.scrollTop+=item.top-bounds.top;
    else if(item.bottom>bounds.bottom)list.scrollTop+=item.bottom-bounds.bottom;
  },[selected,phase,markedOnly]);
  useEffect(()=>()=>{if(downloadRef.current)URL.revokeObjectURL(downloadRef.current)},[]);
  const patchCount=Object.keys(history.current).length;
  const issues=useMemo(()=>model?validateWorkspace(model.slides,history.current):[],[model,history.current]);
  useEffect(()=>{if(issues.length)console.warn('[SlideLatch] template.validation.failed',{issues})},[issues]);
  const pendingExportPatches=useMemo(()=>{
    if(!node||(nameDraft===currentName&&!contentDirty))return history.current;
    return {...history.current,[node.key]:{...history.current[node.key],...(nameDraft!==currentName?{name:nameDraft}:{}),...(contentDirty?{text:nodeContent}:{})}};
  },[node,nameDraft,currentName,contentDirty,nodeContent,history.current]);
  const exportIssues=useMemo(()=>model?validateWorkspace(model.slides,pendingExportPatches):[],[model,pendingExportPatches]);
  const exportBlocked=!model||exportIssues.length>0||!!model.mappingWarnings.length||hasMark&&draftInvalid;
  function changeStep(index:number){
    if(groupMode){setError(locale==='zh'?'请先完成或取消组合编辑。':'Finish or cancel group editing first.');return;}
    if(index===2){setError('');exportDialogRef.current?.showModal();}
    else setPhase(index);
  }
  const issueText=(issue:string)=>{const parts=issue.split(': ');const code=parts.pop()!;return `${parts.join(': ')}: ${t.issueMessages[code as keyof typeof t.issueMessages]||t.invalidMark}`};
  function commit(next:Patches) {
    setHistory(state=>({past:[...state.past,state.current].slice(-80),current:next,future:[]}));
    setDownload(null);
  }
  function updateNode(change:Partial<{name:string;box:Box;text:string}>) {
    if(!node)return;
    commit({...history.current,[node.key]:{...history.current[node.key],...change}});
    console.debug('[SlideLatch] template.patch',{slide:page+1,shapeId:node.id,fields:Object.keys(change)});
  }
  function installTemplate(result:LoadedTemplate,name:string){
    if(downloadRef.current){URL.revokeObjectURL(downloadRef.current);downloadRef.current=null;}
    setModel(result);setFileName(name);setFileSession(value=>value+1);setHistory({past:[],current:{},future:[]});
    setPage(0);setSelected(result.slides[0]?.nodes.find(n=>n.marked)?.key||null);setSelectionKind('node');
    setTransient(null);setGroupMode(null);setContentDraft(null);setPreviewLengths({});setListPreviews({});
    setMarkedOnly(false);setNameDraft('');setDownload(null);setExportReport('');setPhase(1);
  }
  async function openTemplate() {
    if(model){setPhase(1);return;}
    const version=++loadVersion.current;setLoading(true);setError('');
    try{
      const response=await fetch(template.downloadUrl);if(!response.ok)throw new Error(`TEMPLATE_HTTP_${response.status}`);
      const result=await loadTemplate(await response.arrayBuffer());
      if(result.sha256!==template.sha256)throw new Error('TEMPLATE_HASH_MISMATCH');
      if(version!==loadVersion.current)return;
      trackOnce('workbench-started','workbench_started');installTemplate(result,template.downloadUrl.split('/').pop()||'demo.pptx');
    }catch(cause){if(version===loadVersion.current){console.error('[SlideLatch] demo.load.failed',cause);setError(t.loadError);}}finally{if(version===loadVersion.current)setLoading(false);}
  }
  async function openLocalFile(file:File){
    const version=++loadVersion.current;setLoading(true);setError('');
    try{
      if(!/\.pptx$/i.test(file.name)||!file.size||file.size>50*1024*1024)throw new Error('PPTX_FILE_LIMIT');
      const result=await loadTemplate(await file.arrayBuffer());
      if(version===loadVersion.current)installTemplate(result,file.name);
    }catch(cause){if(version===loadVersion.current){console.error('[SlideLatch] local.load.failed',cause);setError(locale==='zh'?'无法读取此 PPTX。请选择有效的 .pptx 文件（最多 50 MB、200 页，解压后最多 200 MB）。原有编辑已保留。':'Could not read this PPTX. Choose a valid .pptx (up to 50 MB, 200 slides, 200 MB expanded). Existing edits are preserved.');}}finally{if(version===loadVersion.current)setLoading(false);}
  }
  useEffect(()=>{if(mode==='studio')void openTemplate();return()=>{loadVersion.current++}},[mode,locale]);
  function addMark(){
    if(!node||!source)return;
    const name=addedMarkName(node,source.nodes,history.current);
    if(name){setNameDraft(name);updateNode({name});}
  }
  function removeMark(){
    if(!node||!source)return;
    const next={...history.current};
    const targets=new Set([node.id]);
    for(const n of source.nodes)if(n.parentId&&targets.has(n.parentId))targets.add(n.id);
    for(const n of source.nodes)if(targets.has(n.id)&&(next[n.key]?.name??n.name).trim().startsWith('@'))next[n.key]={...next[n.key],name:removedMarkName(n)};
    commit(next);setNameDraft(removedMarkName(node));
    setPreviewLengths(state=>Object.fromEntries(Object.entries(state).filter(([key])=>!source.nodes.some(n=>targets.has(n.id)&&n.key===key))));
    console.debug('[SlideLatch] template.mark.remove',{slide:page+1,shapeId:node.id,objects:targets.size});
  }
  function saveContent(){if(node&&contentDirty)updateNode({text:nodeContent});}
  function updateMark(change:Partial<Mark>){if(!node)return;setNameDraft(markName({...mark,...change},node.name,node.kind==='grpSp'));}
  function updateTextLength(key:'min'|'max',value:number){
    if(!node||!Number.isSafeInteger(value)||value<0)return;
    const change=key==='min'?{min:value,max:Math.max(value,mark.max)}:{max:value,min:Math.min(value,mark.min)};
    updateMark(change);
    setPreviewLengths(state=>({...state,[node.key]:value}));
  }
  function changePage(index:number){setWorkflowPreview(null);setSelectionKind('node');setGroupMode(null);setPage(index);setSelected(model?.slides[index].nodes.find(n=>(history.current[n.key]?.name??n.name).startsWith('@'))?.key||null);}
  function resetPosition(){
    if(!node||!history.current[node.key]?.box)return;
    const next={...history.current},patch={...next[node.key]};
    delete patch.box;
    if(Object.keys(patch).length)next[node.key]=patch;else delete next[node.key];
    commit(next);
    console.debug('[SlideLatch] template.position.reset',{slide:page+1,shapeId:node.id});
  }
  function resetAll(){
    commit({});setGroupMode(null);setTransient(null);setContentDraft(null);setPreviewLengths({});setListPreviews({});setNameDraft(node?.name||'');setError('');
    console.info('[SlideLatch] template.operations.reset',{patches:patchCount});
  }
  function undo(){setGroupMode(null);setContentDraft(null);setHistory(s=>s.past.length?{past:s.past.slice(0,-1),current:s.past.at(-1)!,future:[s.current,...s.future]}:s);setDownload(null);}
  function redo(){setGroupMode(null);setContentDraft(null);setHistory(s=>s.future.length?{past:[...s.past,s.current],current:s.future[0],future:s.future.slice(1)}:s);setDownload(null);}
  useEffect(()=>{
    if(phase!==1||exporting||transient||groupMode)return;
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.defaultPrevented||document.querySelector('dialog[open]'))return;
      const target=event.target;
      // Keep native text/input history and IME composition separate from workspace history.
      if(target instanceof Element&&target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'))return;
      const action=historyShortcut(event);if(!action)return;
      event.preventDefault();
      if(action==='undo')undo();else redo();
    };
    window.addEventListener('keydown',onKeyDown);
    return ()=>window.removeEventListener('keydown',onKeyDown);
  },[phase,exporting,transient,groupMode]);
  function drag(event:PointerEvent<SVGElement>,target:SourceNode,mode:'move'|'resize'){
    if(loading||groupMode||!source||!svgRef.current||!target.box)return;
    const svg=svgRef.current,ctm=svg.getScreenCTM();if(!ctm)return;
    event.preventDefault();const start=point([ctm.inverse().a,ctm.inverse().b,ctm.inverse().c,ctm.inverse().d,ctm.inverse().e,ctm.inverse().f],event.clientX,event.clientY);
    const before=history.current,b=boxFor(target,before)!;
    const transform=mode==='move'?inverse(parentMatrix(target,source.nodes,before)):inverse(worldFrame(target,source.nodes,before));
    const origin=point(transform,start.x,start.y);let final:Patches|null=null;
    const move=(e:globalThis.PointerEvent)=>{
      const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(ctm.inverse()),local=point(transform,p.x,p.y);
      const dx=local.x-origin.x,dy=local.y-origin.y;
      const box=mode==='move'?{...b,x:b.x+dx,y:b.y+dy}:{...b,width:Math.max(2,b.width+dx),height:Math.max(2,b.height+dy)};
      final={...before,[target.key]:{...before[target.key],box}};setTransient(final);
    };
    const finish=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',cancel);if(final)commit(final);setTransient(null);};
    const cancel=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',cancel);setTransient(null);};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish,{once:true});window.addEventListener('pointercancel',cancel,{once:true});
  }
  async function exportTemplate(exportPatches:Patches){
    if(!model||exportBlocked)return;
    if(exportPatches!==history.current)commit(exportPatches);
    const count=Object.keys(exportPatches).length;
    setExporting(true);setError('');
    console.info('[SlideLatch] template.export.start',{slides:model.slides.length,patches:count});
    try{
      const bytes=await writePptx(model.bytes,exportPatches);
      const {readSourceSlides}=await import('@/lib/pptx/xml');const check=await readSourceSlides(bytes);
      for(const [key,patch] of Object.entries(exportPatches)){
        if(patch.pageContract){const written=check.find(slide=>`${slide.path}#@page`===key)?.pageContract;if(JSON.stringify(written)!==JSON.stringify(patch.pageContract))throw new Error('EXPORT_PAGE_CONTRACT_MISMATCH');continue;}
        const written=check.flatMap(slide=>slide.nodes).find(node=>node.key===key);
        if(!written||patch.name!==undefined&&written.name!==patch.name)throw new Error('EXPORT_TAG_MISMATCH');
        if(patch.group){
          if(written.kind!=='grpSp')throw new Error('EXPORT_GROUP_MISSING');
          for(const member of patch.group.members)if(!check.flatMap(slide=>slide.nodes).some(n=>n.key===member.key&&n.parentId===written.id))throw new Error('EXPORT_GROUP_MEMBER_MISMATCH');
          for(const member of patch.group.released)if(!check.flatMap(slide=>slide.nodes).some(n=>n.key===member.key&&n.parentId===null))throw new Error('EXPORT_GROUP_RELEASE_MISMATCH');
        }
        if(patch.text!==undefined&&written.text!==patch.text)throw new Error('EXPORT_TEXT_MISMATCH');
        if(patch.box&&(!written.box||Object.keys(patch.box).some(k=>Math.abs(written.box![k as keyof Box]-patch.box![k as keyof Box])>1/12700+.000001)))throw new Error('EXPORT_GEOMETRY_MISMATCH');
      }
      if(check.length!==model.slides.length)throw new Error('EXPORT_SLIDE_COUNT');
      if(downloadRef.current)URL.revokeObjectURL(downloadRef.current);
      const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/vnd.openxmlformats-officedocument.presentationml.presentation'}));downloadRef.current=url;setDownload(url);
      setExportReport(`${check.length} ${locale==='zh'?'页':'slides'} · ${count} ${t.changed}`);setPhase(mode==='studio'?1:2);exportDialogRef.current?.close();
      track('workbench_export_succeeded');console.info('[SlideLatch] template.export.complete',{slides:check.length,patches:count,bytes:bytes.byteLength});
    }catch(cause){track('workbench_export_failed',{reason:'write_failed'});console.error('[SlideLatch] template.export.failed',cause);setError(t.error);}finally{setExporting(false);}
  }
  const properties = model && source ? (<aside className="pptx-properties">
            <section className="pptx-objects-region" aria-label={t.objects}>
            <div className="pptx-object-header"><h3>{t.objects}</h3><label><input type="checkbox" checked={markedOnly} onChange={e=>setMarkedOnly(e.target.checked)}/>{t.markedOnly}</label></div>
            <div className="pptx-object-list" ref={objectListRef}><ListObjects nodes={source.nodes} lists={lists} patches={history.current} selected={selected} markedOnly={markedOnly} onSelect={selectObject} onSelectItem={selectListItem} selectedRef={selectedObjectRef} locale={locale}/></div>
            </section>
            {groupMode?<section className="pptx-inspector-body"><h3>{locale==='zh'?'组合模式':'Group mode'}</h3><p className="coordinate-hint">{locale==='zh'?'从画布选择对象加入组合，取消勾选即可移出。':'Select objects on the canvas to add them; uncheck a member to remove it.'}</p><p className="coordinate-hint">{locale==='zh'?`第 ${groupMode.item} 项 · 已选 ${groupMode.keys.length} 个对象`:`Item ${groupMode.item} · ${groupMode.keys.length} selected`}</p><div className="pptx-group-members">{editableMembers.filter(n=>groupMode.keys.includes(n.key)).map(n=><label className="pptx-checkbox" key={n.key}><input type="checkbox" checked={groupMode.keys.includes(n.key)} onChange={()=>selectObject(n.key)}/><span>{n.text.slice(0,45)||n.name}</span></label>)}</div><button className="pptx-apply" disabled={!groupMode.keys.length} onClick={saveGrouping}>{locale==='zh'?'确认组合':'Confirm group'}</button><button className="pptx-apply" onClick={()=>setGroupMode(null)}>{locale==='zh'?'取消':'Cancel'}</button></section>:node?<section className="pptx-inspector-body" aria-label={t.mark}>
              {selectedList&&<ListSettings list={selectedList} count={listPreviewCount(selectedList,listPreviews)} locale={locale} onChange={updateList} onEdit={startGrouping} onPreview={count=>previewList(selectedList.key,count)}/>}
              {!isListItem&&<><div className="pptx-mark-heading"><h3>{t.mark}</h3>{hasMark&&<button className="pptx-remove-mark" onClick={removeMark}>{t.removeMark}</button>}</div>
              <p className="coordinate-hint">{hasMark?t.aiEditable:t.aiLocked}</p>
              {!hasMark&&<button className="pptx-apply" disabled={!markTypes.length} onClick={addMark}>+ {t.addMark}</button>}
              {hasMark&&<><label className="demo-label" htmlFor="tag-type">{t.markType}</label><select id="tag-type" value={mark.type} onChange={e=>updateMark({type:e.target.value as Mark['type']})}>{!markTypes.includes(mark.type as typeof markTypes[number])&&<option value={mark.type} disabled>{t.invalidMark}</option>}{markTypes.map(type=><option key={type} value={type}>{t.types[type]}</option>)}</select>
              {['sp','cxnSp'].includes(node.kind)&&(node.text||mark.type==='text'||mark.type==='number')&&<div className="pptx-node-content"><label htmlFor="node-content">{t.content}</label><textarea id="node-content" rows={3} value={nodeContent} placeholder={t.emptyContent} onChange={event=>{setContentDraft({key:node.key,value:event.target.value});setPreviewLengths(state=>{const next={...state};delete next[node.key];return next})}} onBlur={saveContent}/><p className="coordinate-hint">{t.contentHint}</p></div>}
              {mark.type==='text'&&<TextLengthControls key={node.key} min={mark.min} max={mark.max} onChange={updateTextLength} locale={locale} previewCount={previewLengths[node.key]}/>}
              {mark.type==='image'&&<label className="demo-label">{t.imageIndex}<input type="number" min="1" value={mark.index} onChange={e=>updateMark({index:Number(e.target.value)})}/></label>}
              {mark.type==='number'&&<><label className="demo-label" htmlFor="number-format">{t.digits}</label><select id="number-format" value={mark.digits} onChange={e=>updateMark({digits:Number(e.target.value)})}>{[1,2,3,4,5,6].map(digits=><option key={digits} value={digits}>{[1,2,3].map(value=>String(value).padStart(digits,'0')).join(' · ')}</option>)}</select></>}
              {draftInvalid&&<p className="pptx-error" role="alert">{t.invalidMark}</p>}
              <button className="pptx-apply" disabled={draftInvalid||(nameDraft===currentName&&!contentDirty)} onClick={()=>updateNode({name:nameDraft,...(contentDirty?{text:nodeContent}:{})})}>{t.apply} ✓</button></>}</>}
            </section>:<section className="pptx-inspector-body" aria-label={t.mark}><h3>{t.mark}</h3><p className="pptx-empty">{t.select}</p></section>}
          </aside>) : null;
  if(mode==='studio')return <>{model&&<WorkflowController editorState={JSON.stringify([phase,selected,nameDraft,contentDraft,previewLengths,listPreviews])} svgRef={svgRef} onCapacityPreview={setCapacityPreview} key={fileSession} model={model} patches={history.current} fileName={fileName} visibleProbeId={workflowPreview?.id??null} currentSlideIndex={page} busy={loading||exporting||!!transient||!!groupMode||contentDirty||nameDraft!==currentName} onApply={next=>{commit(next);setContentDraft(null);setPreviewLengths({});setListPreviews({});}} onPreview={probe=>{setWorkflowPreview(probe);setPreviewLengths({});setListPreviews({});if(probe){setPage(probe.slideIndex);setSelected(probe.key);setSelectionKind('node');}}} onError={setError}/>}<StudioShell
    locale={locale} model={model} fileName={fileName} loading={loading} busy={exporting||!!transient||!!groupMode} error={error}
    page={page} committedPatches={history.current} textPreviews={textPreviews}
    properties={properties} onLocateIssue={issue=>{const target=model?locateAuthorIssue(model.slides,issue):null;if(target){changePage(target.page);if(target.key)selectObject(target.key)}}} onPage={changePage} onOpen={()=>inputRef.current?.click()} onRetry={openTemplate}
    input={<input ref={inputRef} type="file" accept=".pptx" hidden aria-label={locale==='zh'?'选择本地 PPTX':'Choose local PPTX'} onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(file)void openLocalFile(file)}}/>}
    canvas={model&&<SvgSlide model={model} slideIndex={page} patches={patches} selected={groupMode?null:selected} selectedMembers={groupMode?.keys} interactive onSelect={selectObject} onSelectItem={selectListItem} onDrag={drag} svgRef={svgRef} locale={locale} textPreviews={textPreviews} listPreviews={workflowPreview?.kind==='list'&&workflowPreview.listKey?{[workflowPreview.listKey]:workflowPreview.value}:listPreviews} onListPreview={previewList}/>}
    actions={<><button disabled={!history.past.length||exporting} onClick={undo}>↶ {t.undo}</button><button disabled={!history.future.length||exporting} onClick={redo}>↷ {t.redo}</button><button disabled={!node||!history.current[node.key]?.box||exporting} onClick={resetPosition}>{t.resetPosition}</button><button disabled={(!patchCount&&!Object.keys(listPreviews).length&&!Object.keys(previewLengths).length&&!contentDirty&&nameDraft===currentName)||exporting} onClick={resetAll}>{t.resetAll}</button></>}
    issues={model?[...model.mappingWarnings,...exportIssues.map(issueText)]:[]}
    onExport={()=>void exportTemplate(pendingExportPatches)} exportBlocked={!!exportBlocked||!!groupMode||!!transient||exporting} exporting={exporting}
    download={download?{url:download,name:outputName,report:exportReport}:null}
  /></>;
  return <section id="demo" className="demo-wrap interactive-demo pptx-workbench reveal" aria-labelledby="demo-title">
    <div id="workflow" className="demo-intro"><h2 id="demo-title">{t.title}</h2><p>{t.note}</p></div>
    <div className="demo-workspace">
      <ol className="demo-stepper" aria-label={t.title}>{t.steps.map((label,i)=><li key={label}><button type="button" disabled={exporting||i>0&&!model} aria-current={phase===i?'step':undefined} onClick={()=>changeStep(i)}><span>{i<phase?'✓':`0${i+1}`}</span>{label}</button></li>)}</ol>
      {phase===0&&<div className="pptx-choose"><div><img src={template.overview} alt={t.overview}/></div><aside><p className="eyebrow">01</p><h3>{t.template}</h3><p>{t.chooseHint}</p><button className="button button-primary" onClick={openTemplate} disabled={loading}>{loading?t.loading:t.choose}<span aria-hidden="true">→</span></button></aside></div>}
      {phase===1&&model&&source&&<>
        <div className="pptx-toolbar"><div><strong>{fileName||t.template}</strong><span>{page+1} / {model.slides.length}</span><button onClick={()=>overviewRef.current?.showModal()}>{t.preview} ↗</button></div><button className="pptx-next-step" disabled={exporting} onClick={()=>changeStep(2)}>{t.nextStep} <span aria-hidden="true">→</span></button></div>
        <div className="pptx-editor-layout">
          <nav className="pptx-thumbnails" aria-label={locale==='zh'?'PPT 页面列表':'Slide list'}>{model.slides.map((slide,i)=><button key={slide.path} className={page===i?'active':''} onClick={()=>changePage(i)} aria-label={`${t.page} ${i+1}`} aria-current={page===i?'page':undefined}><span className="thumb-number">{String(i+1).padStart(2,'0')}</span><SvgSlide model={model} slideIndex={i} patches={history.current} locale={locale} textPreviews={textPreviews}/></button>)}</nav>
          <div className="pptx-stage"><div className="pptx-canvas-actions" role="toolbar" aria-label={t.operations}>
            <button disabled={!history.past.length} onClick={undo} title={`${t.undo} (⌘Z / Ctrl+Z)`} aria-keyshortcuts="Meta+z Control+z">↶ {t.undo}</button>
            <button disabled={!history.future.length} onClick={redo} title={`${t.redo} (⇧⌘Z / Ctrl+Y / Ctrl+Shift+Z)`} aria-keyshortcuts="Meta+Shift+z Control+y Control+Shift+z">↷ {t.redo}</button>
            <span className="action-divider" aria-hidden="true"/>
            <button disabled={!node||!history.current[node.key]?.box} onClick={resetPosition}>{t.resetPosition}</button>
            <button disabled={!patchCount&&!Object.keys(listPreviews).length&&!Object.keys(previewLengths).length&&!contentDirty&&nameDraft===currentName} onClick={resetAll}>{t.resetAll}</button>
            <span className="canvas-patch-count">{patchCount} {t.changed}</span>
          </div><div className="pptx-canvas"><SvgSlide model={model} slideIndex={page} patches={patches} selected={groupMode?null:selected} selectedMembers={groupMode?.keys} interactive onSelect={selectObject} onSelectItem={selectListItem} onDrag={drag} svgRef={svgRef} locale={locale} textPreviews={textPreviews} listPreviews={workflowPreview?.kind==='list'&&workflowPreview.listKey?{[workflowPreview.listKey]:workflowPreview.value}:listPreviews} onListPreview={previewList}/></div><div className="pptx-stage-status"><span className="pptx-status-identity">{t.page} {page+1}</span><span className="pptx-status-hint">{t.readonly}</span><span className="pptx-status-dimensions">{Math.round(model.deck.size.width)} × {Math.round(model.deck.size.height)} pt</span></div></div>
          {properties}
        </div>
        {(issues.length>0||model.mappingWarnings.length>0)&&<div className="pptx-validation" role="status"><strong>{model.mappingWarnings.length?t.mapping:t.validation}</strong><span>{[...model.mappingWarnings,...issues.map(issueText)].slice(0,4).join(' · ')}</span></div>}
      </>}
      {phase===2&&download&&<div className="pptx-export-result"><span className="export-check">✓</span><h3>{t.done}</h3><p>{t.doneHint}</p><small>{exportReport}</small><a className="button button-primary" href={download} onClick={()=>track('workbench_download_clicked')} download={outputName}>{t.download} ↓</a><button className="demo-reset" onClick={()=>setPhase(1)}>{t.back} ↗</button></div>}
      {error&&<div className="pptx-error-message" role="alert">{error}{!model&&<button onClick={openTemplate}>{t.retry}</button>}</div>}
    </div>
    <dialog ref={exportDialogRef} className="pptx-export-confirm" aria-labelledby="export-confirm-title" onCancel={event=>{if(exporting)event.preventDefault()}}>
      <h3 id="export-confirm-title">{t.confirmExportTitle}</h3><p>{t.confirmExportHint}</p>
      {exportBlocked&&<p className="pptx-error" role="alert">{model?.mappingWarnings.length?t.mapping:t.validation}</p>}
      {error&&<p className="pptx-error" role="alert">{error}</p>}
      <div><button className="button button-secondary" disabled={exporting} onClick={()=>exportDialogRef.current?.close()}>{t.cancelExport}</button><button className="button button-primary" disabled={exporting||exportBlocked} onClick={()=>exportTemplate(pendingExportPatches)}>{exporting?t.exporting:t.confirmExport}</button></div>
    </dialog>
    <dialog ref={overviewRef} className="template-overview" aria-labelledby="overview-title" closedby="any" onClick={dismissDialogOnBackdrop}><div className="overview-content"><div className="overview-header"><h3 id="overview-title">{t.overview}</h3><div><button onClick={()=>overviewRef.current?.close()} aria-label={t.close}>×</button></div></div><div className="overview-image">{model?model.slides.map((slide,index)=><div key={slide.path}><p>{index+1} / {model.slides.length}</p><SvgSlide model={model} slideIndex={index} patches={history.current} locale={locale}/></div>):<img src={template.overview} alt={t.overview} width={3840} height={2160}/>}</div></div></dialog>
  </section>;
}
