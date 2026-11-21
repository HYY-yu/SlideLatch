'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { flushSync } from 'react-dom';
import { recognizeStructure, buildRecognitionRequest } from '@/lib/workflow/recognition';
import { MAX_SEARCH_LENGTH, searchTextCapacity, type TextCapacityReport } from '@/lib/workflow/constraint-search';
import { measurePreviewText, readPreviewTextSamples } from '@/lib/workflow/measure-preview';
import { discoverRepeatedElements, previewRepeatedElements, applyRepeatedElements, type RepeatedElementsPreview } from '@/lib/workflow/repeated-elements';
import { groupedModel } from '@/lib/pptx/grouping';
import { validateWorkspace } from '@/lib/pptx/validation';
import { meaningfulTextLength } from '@/packages/ppt-dsl/src/text-length';
import type { ListLayoutTrial } from './svg-slide';
import { markName, parseMark } from '@/lib/pptx/dsl';
import type { LoadedTemplate, Patches } from '@/lib/pptx/types';
import { writePptx } from '@/lib/pptx/xml';
import { inspectWorkspace, applyMarkProposal, createBoundaryProbes, createWorkflowReview } from '@/lib/workflow/session';
import type { BoundaryProbe, WorkflowSnapshot, BoundaryObservation } from '@/lib/workflow/session';

type TextTarget={key:string;slot?:number};
type StudioCapacityReport=TextCapacityReport & {sourceFits:boolean|null;canFixTextSize:boolean;sourceShapeHasAutoShrink:boolean};
type Props={locale?:'zh'|'en';selectedKey?:string|null;onListTrial?:(trial:ListLayoutTrial|null)=>void;editorState:string;svgRef:React.RefObject<SVGSVGElement|null>;onCapacityPreview:(preview:{key:string;text?:string}|null)=>void;model:LoadedTemplate;patches:Patches;fileName:string;busy:boolean;visibleProbeId:string|null;currentSlideIndex:number;onApply:(patches:Patches)=>void;onPreview:(probe:BoundaryProbe|null)=>void;onError:(message:string)=>void};
export default function WorkflowController(props:Props){
  const {model,patches,fileName,onApply}=props;
  const labelId=useId();
  const [panelOpen,setPanelOpen]=useState(false);
  const [literal,setLiteral]=useState('');
  const [literalResult,setLiteralResult]=useState<{key:string;length:number;fits:boolean|null;hasInvalidCharacters:boolean}|null>(null);
  const [measuring,setMeasuring]=useState(false);
  const [minimum,setMinimum]=useState('1');
  const [candidateId,setCandidateId]=useState('');
  const [trialCount,setTrialCount]=useState(1);
  const [listMin,setListMin]=useState(1);
  const [listMax,setListMax]=useState(1);
  const [listResult,setListResult]=useState<(RepeatedElementsPreview & {textSlots:TextTarget[]})|null>(null);
  const [slotSelection,setSlotSelection]=useState('');
  const [slotReport,setSlotReport]=useState<StudioCapacityReport|null>(null);
  const [actionError,setActionError]=useState('');
  const [snapshot,setSnapshot]=useState<WorkflowSnapshot|null>(null);
  const live=useRef(props);live.current=props;
  const mounted=useRef(true),urls=useRef<string[]>([]),mutationPending=useRef(false);
  const searchRef=useRef<AbortController|null>(null);
  const reports=useRef(new Map<string,StudioCapacityReport>());
  const lastReport=useRef<StudioCapacityReport|null>(null);
  const trialRef=useRef<{candidate:ReturnType<typeof discoverRepeatedElements>[number];report:RepeatedElementsPreview}|null>(null);
  const observationRef=useRef<BoundaryObservation[]>([]),activeRef=useRef<string|null>(null);
  const currentNodes=model.slides[props.currentSlideIndex]?.nodes??[];
  const eligibleNodes=currentNodes.filter(node=>node.kind==='sp'&&!node.children.length&&!node.rotation&&!node.flipH&&!node.flipV&&!node.dataKind&&!node.hasImage&&!!(node.hasTextBody||node.text)&&!!node.box);
  const slotTarget=slotSelection?listResult?.textSlots[Number(slotSelection)]:undefined;
  const selectedText=eligibleNodes.find(node=>node.key===(slotTarget?.key??props.selectedKey));
  const selectedTarget=slotTarget??(selectedText?{key:selectedText.key}:null);
  function cancelCapacity(){searchRef.current?.abort();searchRef.current=null;live.current.onCapacityPreview(null);setMeasuring(false);}
  function clearListTrial(){
    trialRef.current=null;
    live.current.onListTrial?.(null);
    setListResult(null);setSlotSelection('');setSlotReport(null);
  }
  useEffect(()=>{
    cancelCapacity();clearListTrial();
    setLiteralResult(null);setActionError('');
    return()=>{searchRef.current?.abort();live.current.onCapacityPreview(null);live.current.onListTrial?.(null)};
  },[model,patches,props.currentSlideIndex,props.busy,props.editorState]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;for(const url of urls.current)URL.revokeObjectURL(url)}},[]);
  useEffect(()=>{
    let cancelled=false;mutationPending.current=false;setSnapshot(null);activeRef.current=null;observationRef.current=[];live.current.onPreview(null);
    reports.current.clear();lastReport.current=null;
    inspectWorkspace(model,patches).then(value=>{if(!cancelled)setSnapshot(value)}).catch(cause=>{
      if(!cancelled){console.error('[SlideLatch] workflow.inspect.failed',cause);live.current.onError(cause instanceof Error?cause.message:String(cause));}
    });
    return()=>{cancelled=true};
  },[model,patches]);
  const discovery=useMemo(()=>{
    if(!panelOpen||!snapshot)return {candidates:[]};
    try{return {candidates:discoverRepeatedElements(model,props.currentSlideIndex,patches)};}
    catch(cause){console.warn('[SlideLatch] workflow.list.discovery.failed',{slideIndex:props.currentSlideIndex,cause});return {candidates:[],cause};}
  },[panelOpen,snapshot,model,patches,props.currentSlideIndex]);
  const selectedCandidate=discovery.candidates.find(candidate=>candidate.id===candidateId);
  const probes=snapshot?createBoundaryProbes(model,patches,snapshot.snapshotId):[];
  function assertCurrent(allowMutation=false){
    if(!allowMutation&&searchRef.current)throw new Error('Cancel the capacity search before changing workflow state.');
    if(!allowMutation&&mutationPending.current)throw new Error('A proposal is still being applied. Wait for the workspace update.');
    if(!mounted.current||live.current.model!==model||live.current.patches!==patches||live.current.busy||!snapshot)throw new Error('Workspace changed or has unfinished edits. Inspect again.');
  }
  async function inspect(){assertCurrent();return inspectWorkspace(model,patches)}
  function localRecognition(){assertCurrent();return recognizeStructure(snapshot!)}
  function recognitionRequest(){assertCurrent();return buildRecognitionRequest(snapshot!,'studio')}
  function applyMeasuredTextSettings(next:Patches,snapshotId:string){
    for(const [key,report] of reports.current){
      const name=next[key]?.name;
      if(!report.canFixTextSize||report.snapshotId!==snapshotId||!name||name===patches[key]?.name)continue;
      const mark=parseMark(name);
      if(mark.type==='text'&&mark.max===report.recommendedMax)next[key]={...next[key],fixedTextSize:true};
    }
  }
  async function applyProposal(value:unknown){
    assertCurrent();
    if(value&&typeof value==='object'&&'marks' in value&&Array.isArray(value.marks)&&!value.marks.length&&(!('pages' in value)||!Array.isArray(value.pages)||!value.pages.length))throw new Error('No proposed changes. Review skipped objects or edit the proposal.');
    mutationPending.current=true;let committed=false;
    try{
      const fresh=await inspectWorkspace(model,patches);assertCurrent(true);
      const next=await applyMarkProposal(model,patches,fresh,value);
      assertCurrent(true);
      applyMeasuredTextSettings(next,fresh.snapshotId);
      onApply(next);committed=true;return {applied:true};
    }finally{if(!committed)mutationPending.current=false;}
  }
  function previewProbe(id:string){
    assertCurrent();const probe=probes.find(item=>item.id===id);if(!probe)throw new Error('Unknown or stale probe');
    clearListTrial();activeRef.current=id;live.current.onPreview(probe);return probe;
  }
  function recordObservation(input:{probeId:string;snapshotId:string;verdict:'pass'|'fail';reason:string}){
    assertCurrent();
    if(!input||typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>4000||!['pass','fail'].includes(input.verdict)||input.snapshotId!==snapshot!.snapshotId||input.probeId!==activeRef.current||input.probeId!==live.current.visibleProbeId||!probes.some(probe=>probe.id===input.probeId&&probe.slideIndex===live.current.currentSlideIndex))throw new Error('Preview the current probe and supply a pass/fail verdict with a reason.');
    const observation:BoundaryObservation={...input,reason:input.reason.trim(),renderer:'slidelatch-svg',observedAt:new Date().toISOString()};
    observationRef.current=[...observationRef.current.filter(item=>item.probeId!==input.probeId),observation];return observation;
  }
  function getReview(){assertCurrent();return createWorkflowReview(snapshot!,probes,observationRef.current)}
  function targetText(input:{key:string;slot?:number}) {
    const node=eligibleNodes.find(node=>node.key===input?.key);
    if(!node)throw new Error('Choose a supported text shape on the current slide.');
    const trial=trialRef.current;
    if(trial){
      const slot=input.slot===undefined?undefined:trial.report.slots[input.slot];
      if(slot&&trial.candidate.items[slot.sourceIndex].members.some(member=>member.key===node.key)){
        return {node,key:`${node.key}@list-0-${input.slot}`,scope:'group-text' as const,trialCount:trial.report.count};
      }
      if(trial.candidate.items.some(item=>item.members.some(member=>member.key===node.key)))throw new Error('Specify the slot index for this list preview.');
    }
    if(input.slot!==undefined)throw new Error('Preview a list that contains this target slot first.');
    return {node,key:node.key,scope:node.parentId?'group-text' as const:'page-text' as const};
  }

  async function withTextPreview<T>(input:{key:string;slot?:number},measure:(probe:{
    svg:SVGSVGElement;layoutKey:string;sourceText:string;trialCount?:number;sourceFits:boolean|null;hasAutoShrink:boolean;render:(text:string)=>void;
    signal:AbortSignal;isCurrent:()=>boolean;read:()=>ReturnType<typeof measurePreviewText>;
  })=>Promise<T>,checkSource=false) {
    assertCurrent();
    if(live.current.visibleProbeId)throw new Error('Clear the boundary preview before measuring.');
    const {node,key,scope,trialCount}=targetText(input);
    const controller=new AbortController(),slideIndex=props.currentSlideIndex,editorState=props.editorState;
    const sourceText=patches[node.key]?.text??node.text;
    searchRef.current=controller;
    setMeasuring(true);
    const isCurrent=()=>mounted.current&&!controller.signal.aborted&&searchRef.current===controller&&live.current.model===model&&live.current.patches===patches&&!live.current.busy&&live.current.currentSlideIndex===slideIndex&&live.current.editorState===editorState;
    try{
      const read=(svg:SVGSVGElement)=>measurePreviewText(svg,key,{scope,settle:'layout',checkOverlap:true,signal:controller.signal,isCurrent});
      let sourceFits:boolean|null=null;
      if(checkSource&&node.hasAutoShrink){
        flushSync(()=>live.current.onCapacityPreview({key}));
        const svg=live.current.svgRef.current;
        if(svg)sourceFits=(await read(svg)).fits;
        if(!isCurrent())throw new Error('Text measurement invalidated by an editor change.');
      }
      flushSync(()=>live.current.onCapacityPreview({key,text:sourceText}));
      const svg=live.current.svgRef.current;
      const foreign=svg&&Array.from(svg.querySelectorAll('foreignObject[data-workflow-node-key]')).find(el=>el.getAttribute('data-workflow-node-key')===key);
      const sample=foreign?.querySelector('[data-workflow-sample]');
      if(!svg||!sample)throw new Error('The current canvas has no measurable text run for this object.');
      return await measure({svg,layoutKey:key,sourceText,trialCount,sourceFits,hasAutoShrink:!!node.hasAutoShrink,signal:controller.signal,isCurrent,
        render:text=>{if(!sample.isConnected||!isCurrent())throw new Error('Text measurement invalidated by an editor change.');sample.textContent=text;},
        read:()=>read(svg)});
    }finally{
      if(searchRef.current===controller){
        searchRef.current=null;live.current.onCapacityPreview(null);setMeasuring(false);
      }
    }
  }

  async function runCapacity(input:{key:string;upper?:number;slot?:number}){
    return withTextPreview(input,async probe=>{
      const upper=input.upper??MAX_SEARCH_LENGTH;
      const wideSamples=await readPreviewTextSamples(probe.svg,probe.layoutKey);
      if(!wideSamples&&probe.isCurrent())console.warn('[SlideLatch] workflow.text.font-sample.fallback',{key:input.key});
      const samples=[{id:'mixed',seed:'市场分析 Market outlook 客户增长 Customer growth 2026'}];
      if(/[\p{L}\p{N}]/u.test(probe.sourceText))samples.unshift({id:'semantic',seed:probe.sourceText});
      const result=await searchTextCapacity({snapshotId:snapshot!.snapshotId,key:input.key,lower:1,upper,samples,wideSamples},{signal:probe.signal,isCurrent:probe.isCurrent,measure:async candidate=>{
        probe.render(candidate.text);
        return probe.read();
      }});
      const report={
        ...result,sourceFits:probe.sourceFits,sourceShapeHasAutoShrink:probe.hasAutoShrink,
        canFixTextSize:probe.hasAutoShrink&&probe.sourceFits===true&&result.status==='complete'&&result.recommendedMax!==null,
      };
      if(probe.isCurrent()){
        if(probe.trialCount!==undefined)setSlotReport(report);
        else {
          reports.current.set(input.key,report);
          lastReport.current=report;
        }
      }
      console.info('[SlideLatch] workflow.text.capacity.complete',{key:input.key,slideIndex:props.currentSlideIndex,status:result.status,max:result.recommendedMax,trialCount:probe.trialCount});
      return {...report,trialCount:probe.trialCount,fontSample:wideSamples?'computed-font':'default'};
    },true);
  }

  async function measureText(input:{key:string;text:string;slot?:number}){
    if(typeof input?.text!=='string'||input.text.length>MAX_SEARCH_LENGTH*2)throw new Error('Invalid or oversized text sample.');
    const metric=meaningfulTextLength(input.text);
    if(metric.length>MAX_SEARCH_LENGTH)throw new Error('Invalid or oversized text sample.');
    return withTextPreview(input,async probe=>{
      probe.render(input.text);
      const evidence=await probe.read();
      return {snapshotId:snapshot!.snapshotId,key:input.key,trialCount:probe.trialCount,...metric,...evidence};
    });
  }

  function proposeMeasuredRange(min:number,key?:string){
    assertCurrent();
    const report=key?reports.current.get(key):lastReport.current;
    if(!report||report.snapshotId!==snapshot!.snapshotId||report.status!=='complete'||report.recommendedMax===null)throw new Error('No current measured maximum is available.');
    if(!Number.isSafeInteger(min)||min<0||min>report.recommendedMax)throw new Error('Supply a semantic minimum between zero and the measured candidate maximum.');
    const originalName=snapshot!.slides.flatMap(slide=>slide.nodes).find(node=>node.key===report.key)?.name??'';
    const name=markName({...parseMark(originalName),type:'text',min,max:report.recommendedMax},originalName,false);
    return {schemaVersion:1,templateSha256:snapshot!.templateSha256,snapshotId:snapshot!.snapshotId,marks:[{key:report.key,name,reason:`Semantic minimum ${min}. Nominal-font Studio samples fit through ${report.recommendedMax} measured Unicode characters for this snapshot.`}]};
  }

  function discoverRepeatedLists(slideIndex=props.currentSlideIndex){
    assertCurrent();
    return {snapshotId:snapshot!.snapshotId,candidates:discoverRepeatedElements(model,slideIndex,patches)};
  }

  function previewRepeatedList(input:{candidateId:string;count:number;snapshotId:string}){
    assertCurrent();
    if(input.snapshotId!==snapshot!.snapshotId)throw new Error('Inspect the current snapshot before previewing a list.');
    if(live.current.visibleProbeId)throw new Error('Clear the boundary preview before previewing a repeated list.');
    const candidate=discoverRepeatedElements(model,props.currentSlideIndex,patches).find(candidate=>candidate.id===input.candidateId);
    if(!candidate)throw new Error('Select a repeated candidate on the current slide.');
    const report=previewRepeatedElements(model,patches,candidate,input.count);
    const textSlots=report.slots.flatMap((slot,index)=>candidate.items[slot.sourceIndex].members
      .filter(member=>member.role==='text'&&eligibleNodes.some(node=>node.key===member.key))
      .map(member=>({key:member.key,slot:index})));
    const conflicts=report.issues.flatMap(issue=>'itemIndex'in issue
      ?'otherItemIndex'in issue?[issue.itemIndex,issue.otherItemIndex]:[issue.itemIndex]:[]);
    trialRef.current={candidate,report};
    live.current.onListTrial?.({items:candidate.items,slots:report.slots,conflicts});
    setSlotSelection('');setSlotReport(null);setLiteralResult(null);
    setListResult({...report,textSlots});
    if(!report.fits)console.warn('[SlideLatch] workflow.list.preview.conflict',{slideIndex:candidate.slideIndex,count:report.count,issues:report.issues});
    return {...report,snapshotId:snapshot!.snapshotId,textSlots};
  }

  async function applyRepeatedList(input:{candidateId:string;min:number;max:number;snapshotId:string;proposal?:unknown}){
    assertCurrent();
    if(input.snapshotId!==snapshot!.snapshotId)throw new Error('Inspect the current snapshot before grouping.');
    const slideIndex=props.currentSlideIndex;
    mutationPending.current=true;let committed=false;
    try{
      const prepared=input.proposal===undefined?patches:await applyMarkProposal(model,patches,snapshot!,input.proposal);
      if(input.proposal!==undefined)applyMeasuredTextSettings(prepared,snapshot!.snapshotId);
      assertCurrent(true);
      if(live.current.currentSlideIndex!==slideIndex)throw new Error('Slide changed before grouping.');
      const result=applyRepeatedElements(model,prepared,{id:input.candidateId,slideIndex},input);
      const issues=validateWorkspace(groupedModel(model,result.patches).slides,result.patches);
      if(issues.length)throw new Error(`REPEATED_ELEMENTS_WORKSPACE_INVALID: ${issues.join('; ')}`);
      clearListTrial();
      onApply(result.patches);committed=true;
      console.info('[SlideLatch] workflow.list.apply.complete',{slideIndex,min:input.min,max:input.max});
      return {applied:true,selected:result.selected};
    }finally{if(!committed)mutationPending.current=false;}
  }
  async function exportReviewBundle(){
    try{
      assertCurrent();console.info('[SlideLatch] workflow.review.export.start',{snapshotId:snapshot!.snapshotId});const bytes=await writePptx(model.bytes,patches);assertCurrent();
      const digest=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes));assertCurrent();
      const sha=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
      const review=createWorkflowReview(snapshot!,probes,observationRef.current,sha);
      const zip=new JSZip();zip.file('marked.pptx',bytes);zip.file('workflow-review.json',JSON.stringify(review,null,2));zip.file('workspace-inspection.json',JSON.stringify(snapshot,null,2));
      const blob=await zip.generateAsync({type:'blob'});assertCurrent();
      const name=fileName.replace(/\.pptx$/i,'')+'-workflow.zip',url=URL.createObjectURL(blob);urls.current.push(url);
      const link=document.createElement('a');link.href=url;link.download=name;link.click();
      console.info('[SlideLatch] workflow.review.export.complete',{snapshotId:snapshot!.snapshotId,templateSha256:sha,bytes:blob.size,status:review.status});
      return {name,bytes:blob.size,templateSha256:sha,status:review.status};
    }catch(cause){console.error('[SlideLatch] workflow.review.export.failed',cause);throw cause;}
  }
  useEffect(()=>{
    const api={inspect,applyProposal,previewProbe,recordObservation,getReview,recognizeStructure:localRecognition,buildRecognitionRequest:recognitionRequest,searchTextCapacity:runCapacity,cancelCapacitySearch:cancelCapacity,proposeMeasuredRange,measureText,getCapacityReport:(key?:string)=>structuredClone(key?reports.current.get(key)??null:lastReport.current),getCapacityReports:()=>structuredClone([...reports.current.values()]),discoverRepeatedLists,previewRepeatedList,clearListTrial:()=>{assertCurrent();clearListTrial();},applyRepeatedList,clearBoundaryPreview:()=>{assertCurrent();activeRef.current=null;live.current.onPreview(null);},exportReviewBundle};
    const host=window as unknown as {slidelatchWorkflow?:typeof api};host.slidelatchWorkflow=api;
    return()=>{if(host.slidelatchWorkflow===api)delete host.slidelatchWorkflow};
  });
  if(!props.locale)return null;
  const zh=props.locale==='zh';
  const selectedReport=slotTarget?slotReport:selectedText?reports.current.get(selectedText.key):undefined;
  const selectedLiteral=literalResult?.key===selectedText?.key?literalResult:null;
  const candidateLabel=selectedCandidate?.items.length??0;
  const disabled=!snapshot||props.busy||measuring;
  function perform(action:()=>unknown|Promise<unknown>){
    setActionError('');
    void Promise.resolve().then(action).catch(cause=>{
      console.warn('[SlideLatch] workflow.marking.action.failed',{slideIndex:props.currentSlideIndex,cause});
      const message=cause instanceof Error?cause.message:String(cause);
      if(message==='REPEATED_ELEMENTS_COMPONENT_MARKS_REQUIRED'){
        setActionError(zh?'请选择每项要复用的文字、图片、图标或序号，并先标记对应组件。':'Mark the corresponding text, image, icon, or number in every item first.');
      }else if(message==='REPEATED_ELEMENTS_FIRST_TEXT_RANGE_REQUIRED'){
        setActionError(zh?'请先给第一项的文字组件设置长度范围。':'Set a text range for each text component in the first item.');
      }else setActionError(message);
    });
  }
  return <details className="pptx-inspector-body" onToggle={event=>{
    setPanelOpen(event.currentTarget.open);
    if(!event.currentTarget.open){cancelCapacity();clearListTrial();}
  }}>
    <summary>{zh?'打标测量':'Measure for marking'}</summary>
    <div className="pptx-node-content">
      <button type="button" className="pptx-apply" disabled={disabled||!selectedTarget} onClick={()=>perform(()=>runCapacity(selectedTarget!))}>{zh?'测量所选文本框':'Measure selected text box'}</button>
      {measuring&&<button type="button" className="pptx-apply" onClick={cancelCapacity}>{zh?'取消测量':'Cancel measurement'}</button>}
      {selectedReport&&<div role="status">
        <p>{selectedReport.recommendedMax===null?(zh?'未得到可用上限':'No usable upper bound'):(zh?`候选上限 ${selectedReport.recommendedMax} 字符`:`Suggested maximum: ${selectedReport.recommendedMax} characters`)}</p>
        {!slotTarget&&selectedReport.sourceShapeHasAutoShrink&&<p className="coordinate-hint">
          {selectedReport.canFixTextSize?(zh?'原文可用原字号，采用范围时关闭自动缩小。':'The source fits at its original font size. Applying the range disables shrink-to-fit.'):
            (zh?'原文的原字号效果需复核，采用范围时保留源自动缩小设置。':'Review the source at its original font size. Its shrink-to-fit setting will be preserved.')}
        </p>}
        <ul>{selectedReport.familyLimits.map(family=><li key={family.sampleId}>
          {({semantic:zh?'原文': 'Source',mixed:zh?'中英混排':'Mixed','cjk-wide':zh?'宽中文':'Wide Chinese','latin-wide':zh?'宽英文':'Wide English'})[family.sampleId]??family.sampleId}
          {' '}{family.maxFit??'—'}{family.firstFailure===null&&family.firstUnknown===null&&family.maxFit!==null?'+':''}
        </li>)}</ul>
        {!slotTarget&&selectedReport.recommendedMax!==null&&<><label htmlFor={labelId+'-minimum'}>{zh?'语义最少字符数':'Minimum characters for the content'}</label>
          <input id={labelId+'-minimum'} type="number" min="0" max={selectedReport.recommendedMax} value={minimum} onChange={e=>setMinimum(e.target.value)}/>
          <button type="button" className="pptx-apply" disabled={disabled||!minimum} onClick={()=>perform(()=>applyProposal(proposeMeasuredRange(Number(minimum),selectedText!.key)))}>{zh?'采用文本范围':'Apply text range'}</button></>}
      </div>}
      {selectedText&&<><label htmlFor={labelId+'-sample'}>{zh?'自定义试填文字':'Custom text sample'}</label>
        <textarea id={labelId+'-sample'} value={literal} onChange={e=>{setLiteral(e.target.value);setLiteralResult(null);}}/>
        <button type="button" className="pptx-apply" disabled={disabled} onClick={()=>perform(async()=>setLiteralResult(await measureText({...selectedTarget!,text:literal})))}>{zh?'检查试填':'Check sample'}</button>
        {selectedLiteral&&<p role="status">{selectedLiteral.length} {zh?'字符':'characters'} · {selectedLiteral.fits===null?(zh?'无法测量':'Inconclusive'):selectedLiteral.fits?(zh?'可容纳':'Fits'):(zh?'溢出':'Overflows')}{selectedLiteral.hasInvalidCharacters&&(zh?' · 包含合同不允许的格式字符':' · Contains unsupported format characters')}</p>}
      </>}
    </div>
    <div className="pptx-node-content">
      <label htmlFor={labelId+'-list'}>{zh?'重复对象候选':'Repeated object candidates'}</label>
      <select id={labelId+'-list'} value={selectedCandidate?.id??''} disabled={disabled||!discovery.candidates.length} onChange={e=>{
        const candidate=discovery.candidates.find(candidate=>candidate.id===e.target.value);
        clearListTrial();setCandidateId(e.target.value);
        if(candidate){const count=candidate.items.length;setTrialCount(count);setListMin(count);setListMax(count);}
      }}>
        <option value="">{discovery.cause?(zh?'无法识别':'Discovery unavailable'):(zh?'选择重复对象':'Choose repeated objects')}</option>
        {discovery.candidates.map((candidate,index)=><option key={candidate.id} value={candidate.id}>
          {index+1} · {candidate.kind==='native-groups'?(zh?'原生组':'Native groups'):(zh?'独立对象':'Separate objects')}
          {' · '}{candidate.items.length} {zh?'项':'items'}
        </option>)}
      </select>
      {selectedCandidate&&<>
        <ul>{selectedCandidate.items.map(item=><li key={item.rootKeys.join(' ')}>{item.members.map(member=>{
          const node=currentNodes.find(node=>node.key===member.key);
          return (node?.text.trim()||node?.name||member.key).slice(0,40);
        }).join(' · ')}</li>)}</ul>
        <label htmlFor={labelId+'-count'}>{zh?'试排项数':'Preview item count'}</label>
        <input id={labelId+'-count'} type="number" min="1" max="100" value={trialCount} onChange={e=>{clearListTrial();setTrialCount(Number(e.target.value));}}/>
        <button type="button" className="pptx-apply" disabled={disabled} onClick={()=>perform(()=>previewRepeatedList({candidateId,count:trialCount,snapshotId:snapshot!.snapshotId}))}>{zh?'试排列表':'Preview list layout'}</button>
        {listResult&&<p role="status">{listResult.count} {zh?'项':'items'} · {listResult.fits?(zh?'几何检查通过':'Geometry fits'):(zh?`发现 ${listResult.issues.length} 处重叠或出界`:`${listResult.issues.length} overlaps or out-of-bounds items`)}</p>}
        {!!listResult?.textSlots.length&&<>
          <label htmlFor={labelId+'-text-slot'}>{zh?'试排文字对象':'Text in previewed items'}</label>
          <select id={labelId+'-text-slot'} value={slotSelection} disabled={disabled} onChange={e=>{
            setSlotSelection(e.target.value);setSlotReport(null);setLiteralResult(null);
          }}>
            <option value="">{zh?'选择列表文字':'Choose list text'}</option>
            {listResult.textSlots.map((target,index)=>{
              const shape=currentNodes.find(node=>node.key===target.key);
              return <option key={`${target.key}:${target.slot}`} value={index}>
                {zh?`第 ${(target.slot??0)+1} 项`:`Item ${(target.slot??0)+1}`} · {(shape?.text.trim()||shape?.name||target.key).slice(0,42)}
              </option>;
            })}
          </select>
        </>}
        <label htmlFor={labelId+'-list-min'}>{zh?'最少项数':'Minimum items'}</label>
        <input id={labelId+'-list-min'} type="number" min="1" max={candidateLabel} value={listMin} onChange={e=>setListMin(Number(e.target.value))}/>
        <label htmlFor={labelId+'-list-max'}>{zh?'最多项数':'Maximum items'}</label>
        <input id={labelId+'-list-max'} type="number" min={candidateLabel} max="100" value={listMax} onChange={e=>setListMax(Number(e.target.value))}/>
        <button type="button" className="pptx-apply" disabled={disabled||!listResult?.fits||listMin>=listMax} onClick={()=>perform(()=>applyRepeatedList({candidateId,min:listMin,max:listMax,snapshotId:snapshot!.snapshotId}))}>{zh?'采用列表范围':'Apply list range'}</button>
        {listResult&&<button type="button" className="pptx-apply" disabled={disabled} onClick={clearListTrial}>{zh?'恢复原布局':'Restore source layout'}</button>}
      </>}
    </div>
    {actionError&&<p role="alert" className="pptx-error">{actionError}</p>}
  </details>;
}
