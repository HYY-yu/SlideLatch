'use client';
import { useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import { flushSync } from 'react-dom';
import { recognizeStructure, buildRecognitionRequest } from '@/lib/workflow/recognition';
import { searchTextCapacity } from '@/lib/workflow/constraint-search';
import { measurePreviewText } from '@/lib/workflow/measure-preview';
import { slideLists } from '@/lib/pptx/lists';
import type { LoadedTemplate, Patches } from '@/lib/pptx/types';
import { writePptx } from '@/lib/pptx/xml';
import { inspectWorkspace, applyMarkProposal, createBoundaryProbes, createWorkflowReview } from '@/lib/workflow/session';
import type { BoundaryProbe, WorkflowSnapshot, BoundaryObservation } from '@/lib/workflow/session';

type Props={editorState:string;svgRef:React.RefObject<SVGSVGElement|null>;onCapacityPreview:(preview:{key:string;text:string}|null)=>void;model:LoadedTemplate;patches:Patches;locale:'zh'|'en';fileName:string;busy:boolean;visibleProbeId:string|null;currentSlideIndex:number;onApply:(patches:Patches)=>void;onPreview:(probe:BoundaryProbe|null)=>void};
export default function WorkflowPanel(props:Props){
  const {model,patches,locale,fileName,busy,onApply,onPreview}=props;
  const zh=locale==='zh';
  const [snapshot,setSnapshot]=useState<WorkflowSnapshot|null>(null),[proposal,setProposal]=useState(''),[error,setError]=useState('');
  const [observations,setObservations]=useState<BoundaryObservation[]>([]),[active,setActive]=useState<string|null>(null),[reason,setReason]=useState(''),[working,setWorking]=useState(false);
  const live=useRef(props);live.current=props;
  const searchRef=useRef<AbortController|null>(null);
  const [capacityMinimum,setCapacityMinimum]=useState('');
  const [capacityKey,setCapacityKey]=useState(''),[capacityUpper,setCapacityUpper]=useState(128),[capacityRunning,setCapacityRunning]=useState(false),[progress,setProgress]=useState(0);
  const [capacityReport,setCapacityReport]=useState<Awaited<ReturnType<typeof searchTextCapacity>>|null>(null);
  const reportRef=useRef(capacityReport);reportRef.current=capacityReport;
  const [pageType,setPageType]=useState('内容页'),[pageLogic,setPageLogic]=useState('');
  useEffect(()=>{const contract=snapshot?.slides[props.currentSlideIndex]?.pageContract;setPageType(contract?.pageType??'内容页');setPageLogic(contract?.logic.join('\n')??'');},[snapshot,props.currentSlideIndex]);
  const [recognition,setRecognition]=useState<ReturnType<typeof recognizeStructure>|null>(null);
  const currentNodes=model.slides[props.currentSlideIndex]?.nodes??[];
  const childIds=new Set(currentNodes.flatMap(node=>node.children));
  const listKeys=new Set(slideLists(currentNodes,patches).flatMap(list=>list.items.flatMap(item=>item.nodes.map(node=>node.key))));
  const eligibleNodes=currentNodes.filter(node=>node.kind==='sp'&&!childIds.has(node.id)&&!listKeys.has(node.key)&&!node.parentId&&!node.rotation&&!node.flipH&&!node.flipV&&!node.dataKind&&!node.hasImage&&!!(node.hasTextBody||node.text)&&!!node.text.trim()&&!!node.box);
  function cancelCapacity(){searchRef.current?.abort();searchRef.current=null;setCapacityRunning(false);live.current.onCapacityPreview(null);}
  useEffect(()=>{cancelCapacity();setCapacityReport(null);reportRef.current=null;setProgress(0);setCapacityKey('');return()=>{searchRef.current?.abort();live.current.onCapacityPreview(null)};
  // All editor changes invalidate measurements; programmatic candidate previews do not alter these dependencies.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[model,patches,props.currentSlideIndex,props.busy,props.editorState]);
  function localRecognition(){assertCurrent();const result=recognizeStructure(snapshot!);setRecognition(result);setProposal(JSON.stringify(result.proposal,null,2));return result;}
  function recognitionRequest(){assertCurrent();return buildRecognitionRequest(snapshot!);}
  async function runCapacity(input:{key:string;upper?:number}){
    assertCurrent();if(searchRef.current)throw new Error('A capacity search is already running.');
    if(!input||!eligibleNodes.some(node=>node.key===input.key))throw new Error('Choose an ordinary, unrotated page-level text node on the current slide.');
    const upper=input.upper??128;if(!Number.isInteger(upper)||upper<1||upper>128)throw new Error('Search upper bound must be 1–128.');
    const controller=new AbortController(),slideIndex=props.currentSlideIndex,editorState=props.editorState;
    searchRef.current=controller;setCapacityRunning(true);setProgress(0);setCapacityReport(null);reportRef.current=null;
    const isCurrent=()=>mounted.current&&!controller.signal.aborted&&searchRef.current===controller&&live.current.model===model&&live.current.patches===patches&&!live.current.busy&&live.current.currentSlideIndex===slideIndex&&live.current.editorState===editorState;
    try{
      const result=await searchTextCapacity({snapshotId:snapshot!.snapshotId,key:input.key,lower:1,upper,samples:[{id:'semantic',seed:patches[input.key]?.text??eligibleNodes.find(node=>node.key===input.key)!.text}]},{signal:controller.signal,isCurrent,measure:async candidate=>{
        if(!isCurrent())throw new Error('Capacity search invalidated by editor changes.');
        flushSync(()=>live.current.onCapacityPreview({key:input.key,text:candidate.text}));
        const svg=live.current.svgRef.current;if(!svg)throw new Error('Current SVG editor is unavailable.');
        const evidence=await measurePreviewText(svg,input.key,{signal:controller.signal,isCurrent});
        if(!isCurrent())throw new Error('Capacity search invalidated by editor changes.');
        setProgress(count=>count+1);return evidence;
      }});
      if(isCurrent()){setCapacityReport(result);reportRef.current=result;}return result;
    }finally{if(searchRef.current===controller){searchRef.current=null;setCapacityRunning(false);live.current.onCapacityPreview(null);}}
  }

  function proposeMeasuredRange(min:number){
    assertCurrent();const report=reportRef.current;
    if(!report||report.snapshotId!==snapshot!.snapshotId||report.status!=='complete'||report.recommendedMax===null||!eligibleNodes.some(node=>node.key===report.key))throw new Error('No current measured maximum is available.');
    if(!Number.isSafeInteger(min)||min<0||min>report.recommendedMax)throw new Error('Supply a semantic minimum between zero and the measured candidate maximum.');
    const candidate={schemaVersion:1,templateSha256:snapshot!.templateSha256,snapshotId:snapshot!.snapshotId,marks:[{key:report.key,name:`@文本[${min}-${report.recommendedMax}]`,reason:`Semantic minimum explicitly supplied as ${min}; maximum ${report.recommendedMax} is only a candidate from finite SVG layout measurements. Visual review and compiler validation remain required.`}]};
    setProposal(JSON.stringify(candidate,null,2));return candidate;
  }

  const mounted=useRef(true),urls=useRef<string[]>([]),mutationPending=useRef(false);
  const observationRef=useRef(observations);observationRef.current=observations;
  const activeRef=useRef(active);activeRef.current=active;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;for(const url of urls.current)URL.revokeObjectURL(url)}},[]);
  useEffect(()=>{
    let cancelled=false;mutationPending.current=false;setSnapshot(null);setActive(null);activeRef.current=null;setObservations([]);observationRef.current=[];setReason('');setRecognition(null);onPreview(null);
    inspectWorkspace(model,patches).then(value=>{if(!cancelled)setSnapshot(value)}).catch(cause=>{if(!cancelled)setError(String(cause))});
    return()=>{cancelled=true};
  // Parent preview callback is intentionally not a dependency: only committed workspace changes invalidate evidence.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[model,patches]);
  const probes=snapshot?createBoundaryProbes(model,patches,snapshot.snapshotId):[];
  function assertCurrent(allowMutation=false){if(!allowMutation&&searchRef.current)throw new Error('Cancel the capacity search before changing workflow state.');if(!allowMutation&&mutationPending.current)throw new Error('A proposal is still being applied. Wait for the workspace update.');if(!mounted.current||live.current.model!==model||live.current.patches!==patches||live.current.busy||!snapshot)throw new Error('Workspace changed or has unfinished edits. Inspect again.');}
  async function inspect(){assertCurrent();return inspectWorkspace(model,patches)}
  async function applyProposal(value:unknown){
    assertCurrent();if(value&&typeof value==='object'&&'marks' in value&&Array.isArray(value.marks)&&!value.marks.length&&(!('pages' in value)||!Array.isArray(value.pages)||!value.pages.length))throw new Error('No proposed changes. Review skipped objects or edit the proposal.');mutationPending.current=true;let committed=false;
    try{const fresh=await inspectWorkspace(model,patches);assertCurrent(true);
      const next=await applyMarkProposal(model,patches,fresh,value);assertCurrent(true);onApply(next);committed=true;return {applied:true};
    }finally{if(!committed)mutationPending.current=false;}
  }
  function previewProbe(id:string){assertCurrent();const probe=probes.find(item=>item.id===id);if(!probe)throw new Error('Unknown or stale probe');activeRef.current=id;setActive(id);setReason('');onPreview(probe);return probe;}
  function recordObservation(input:{probeId:string;snapshotId:string;verdict:'pass'|'fail';reason:string}){
    assertCurrent();
    if(!input||typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>4000||!['pass','fail'].includes(input.verdict)||input.snapshotId!==snapshot!.snapshotId||input.probeId!==activeRef.current||input.probeId!==live.current.visibleProbeId||!probes.some(probe=>probe.id===input.probeId&&probe.slideIndex===live.current.currentSlideIndex))throw new Error('Preview the current probe and supply a pass/fail verdict with a reason.');
    const observation:BoundaryObservation={...input,reason:input.reason.trim(),renderer:'slidelatch-svg',observedAt:new Date().toISOString()};
    const next=[...observationRef.current.filter(item=>item.probeId!==input.probeId),observation];observationRef.current=next;setObservations(next);return observation;
  }
  function getReview(){assertCurrent();return createWorkflowReview(snapshot!,probes,observationRef.current)}
  useEffect(()=>{
    const api={inspect,applyProposal,previewProbe,recordObservation,getReview,recognizeStructure:localRecognition,buildRecognitionRequest:recognitionRequest,searchTextCapacity:runCapacity,cancelCapacitySearch:cancelCapacity,proposeMeasuredRange,getCapacityReport:()=>reportRef.current};
    const host=window as unknown as {slidelatchWorkflow?:typeof api};host.slidelatchWorkflow=api;
    return()=>{if(host.slidelatchWorkflow===api)delete host.slidelatchWorkflow};
  });
  function download(blob:Blob,name:string){const url=URL.createObjectURL(blob);urls.current.push(url);const link=document.createElement('a');link.href=url;link.download=name;link.click();}
  function json(value:unknown,name:string){download(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),name)}
  async function run(action:()=>unknown|Promise<unknown>){setError('');setWorking(true);try{await action()}catch(cause){setError(cause instanceof Error?cause.message:String(cause))}finally{if(mounted.current)setWorking(false)}}
  async function release(){
    assertCurrent();const bytes=await writePptx(model.bytes,patches);assertCurrent();
    const digest=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes));assertCurrent();
    const sha=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
    const review=createWorkflowReview(snapshot!,probes,observationRef.current,sha);
    const zip=new JSZip();zip.file('marked.pptx',bytes);zip.file('workflow-review.json',JSON.stringify(review,null,2));zip.file('workspace-inspection.json',JSON.stringify(snapshot,null,2));
    const blob=await zip.generateAsync({type:'blob'});assertCurrent();download(blob,fileName.replace(/\.pptx$/i,'')+'-workflow.zip');
  }
  const disabled=busy||working||capacityRunning||!snapshot;
  const allObserved=!!probes.length&&probes.every(probe=>observations.some(o=>o.probeId===probe.id&&o.snapshotId===snapshot?.snapshotId&&o.verdict==='pass'));
  const status=snapshot?createWorkflowReview(snapshot,probes,observations).status:'loading';
  const statusLabel=allObserved&&status==='needs_review'?(zh?'边界样本已记录通过，导出后仍须编译门禁':'Boundary samples passed; export and compiler checks still required'):status;
  return <section aria-label={zh?'AI 辅助流程':'AI-assisted workflow'} style={{padding:24,borderTop:'1px solid #d4d4d8'}}>
    <h3>{zh?'AI 辅助打标与边界审查':'AI-assisted marking and boundary review'}</h3>
    <p>{zh?'本地规则可识别结构候选，不是模型 AI 识别。可导出与模型服务无关的请求供外部 AI 分析；建议须验证后手动应用。此页面不向网络发送文档。':'Local rules identify structural candidates, not model AI recognition. Export a provider-neutral request for external analysis; proposals require explicit validation and application. This page does not transmit documents.'}</p>
    <p>{zh?'SVG 预览仅用于辅助审查，不能证明 PowerPoint 的字体、溢出或最终排版。修改工作区会清空本轮审查。':'SVG previews assist review but do not prove PowerPoint font, overflow, or final layout fidelity. Workspace edits invalidate this review.'}</p>
    <div style={{display:'flex',gap:12,flexWrap:'wrap',margin:'12px 0'}}>
      <button disabled={disabled} onClick={()=>void run(async()=>json(await inspect(),'workspace-inspection.json'))}>{zh?'导出 AI 检查清单':'Export AI inspection'}</button>
      <button disabled={disabled} onClick={()=>void run(()=>json({schemaVersion:1,templateSha256:snapshot!.templateSha256,snapshotId:snapshot!.snapshotId,marks:[]},'mark-proposal.json'))}>{zh?'导出建议格式':'Export proposal format'}</button>
    </div>
    <div style={{display:'flex',gap:12,flexWrap:'wrap',margin:'12px 0'}}>
      <button disabled={disabled} onClick={()=>void run(localRecognition)}>{zh?'生成本地规则候选（不自动应用）':'Generate local rule candidates (no automatic application)'}</button>
      <button disabled={disabled} onClick={()=>void run(()=>json(recognitionRequest(),'recognition-request.json'))}>{zh?'导出模型中立识别请求':'Export provider-neutral recognition request'}</button>
    </div>
    {recognition&&<details><summary>{zh?'查看规则候选与限制':'Rule candidates and limitations'}</summary><pre style={{maxHeight:260,overflow:'auto',whiteSpace:'pre-wrap'}}>{JSON.stringify(recognition,null,2)}</pre></details>}
    <fieldset style={{margin:'20px 0',padding:16}}><legend>{zh?'自动测量当前页文本容量':'Automatically measure current-slide text capacity'}</legend>
      <p>{zh?'只测普通、未旋转、非列表的页级文本。从长度 1 开始逐个候选在实际 SVG 编辑器中渲染并测量 3 种压力文本（1 仅为搜索起点）。结果仅为预览容量候选，不推断语义最小值，不修改标记或代替目视审查。':'Only ordinary, unrotated, non-list page text is supported. Starting at length 1 (a search start only), each candidate is rendered in the actual SVG editor and measured with 3 stress strings. Results are preview capacity candidates, not semantic minimums, marker edits, or visual approval.'}</p>
      <label>{zh?'文本对象 ':'Text node '}<select disabled={disabled} value={capacityKey} onChange={event=>{setCapacityKey(event.target.value);setCapacityReport(null);reportRef.current=null;setProgress(0);}}><option value="">{zh?'选择当前页文本':'Choose current-slide text'}</option>{eligibleNodes.map(node=><option key={node.key} value={node.key}>{node.key} · {node.name}</option>)}</select></label>
      <label style={{marginLeft:12}}>{zh?'搜索上限（1–128） ':'Search ceiling (1–128) '}<input type="number" min={1} max={128} value={capacityUpper} disabled={disabled} onChange={event=>setCapacityUpper(Number(event.target.value))} style={{width:75}}/></label>
      <button disabled={disabled||!capacityKey} onClick={()=>void run(()=>runCapacity({key:capacityKey,upper:capacityUpper}))}>{zh?'开始实际渲染测量':'Start live-render measurement'}</button>
      {capacityRunning&&<button onClick={cancelCapacity}>{zh?'取消并恢复内容':'Cancel and restore content'}</button>}
      <p aria-live="polite">{zh?'已测量压力样本':'Stress samples measured'}: {progress} / {capacityUpper*3}</p>
      {capacityReport&&<><p><strong>{zh?'候选最大值':'Candidate maximum'}: {capacityReport.recommendedMax??(zh?'无可靠候选':'No reliable candidate')} · {capacityReport.status}</strong></p><p>{zh?'测量完成。候选上限与失败样本详见报告；工作区修改会使结果失效。':'Measurement finished. See the report for status, candidate ceiling and failing samples. Editor changes invalidate this result.'}</p>{capacityReport.recommendedMax!==null&&<div><label>{zh?'语义最小字数（需明确指定） ':'Semantic minimum (explicit input required) '}<input type="number" min={0} max={capacityReport.recommendedMax} value={capacityMinimum} onChange={event=>setCapacityMinimum(event.target.value)} style={{width:80}}/></label><button disabled={disabled||capacityMinimum===''} onClick={()=>void run(()=>proposeMeasuredRange(Number(capacityMinimum)))}>{zh?'用测量结果生成标记提案（不自动应用）':'Prepare a measured-range proposal (no automatic application)'}</button></div>}<button onClick={()=>json(capacityReport,'text-capacity-report.json')}>{zh?'导出容量候选报告':'Export capacity candidate report'}</button><details open><summary>{zh?'测量报告':'Measurement report'}</summary><pre style={{maxHeight:300,overflow:'auto',whiteSpace:'pre-wrap'}}>{JSON.stringify(capacityReport,null,2)}</pre></details></>}
    </fieldset>
    <fieldset style={{margin:'20px 0',padding:16}}><legend>{zh?'当前页类型与顺序逻辑':'Current-page type and ordered logic'}</legend>
      <p>{zh?'明确确认后写入页面契约，保留原有讲者备注。每行填写一条顺序逻辑；规则猜测不会自动应用。':'Explicitly apply a page contract while preserving existing speaker notes. Enter one ordered logic step per line. Rule guesses are not applied automatically.'}</p>
      <label>{zh?'页面类型 ':'Page type '}<select value={pageType} disabled={disabled} onChange={event=>setPageType(event.target.value)}>{['封面页','目录页','章节过渡页','内容页','结尾页'].map(type=><option key={type} value={type}>{type}</option>)}</select></label>
      <label style={{display:'block'}}>{zh?'顺序逻辑（每行一步）':'Ordered logic (one step per line)'}<textarea rows={3} maxLength={12000} disabled={disabled} value={pageLogic} onChange={event=>setPageLogic(event.target.value)} style={{display:'block',width:'100%'}}/></label>
      <button disabled={disabled} onClick={()=>void run(()=>applyProposal({schemaVersion:1,templateSha256:snapshot!.templateSha256,snapshotId:snapshot!.snapshotId,pages:[{path:snapshot!.slides[props.currentSlideIndex].path,pageType,logic:pageLogic.split('\n').map(line=>line.trim()).filter(Boolean),reason:'Explicit page contract entered and confirmed in the editor.'}]}))}>{zh?'验证并应用当前页契约':'Validate and apply current-page contract'}</button>
    </fieldset>
    <label htmlFor="workflow-proposal">{zh?'AI 建议 JSON（每条 marks 包含 key、name、reason）':'AI proposal JSON (each marks entry contains key, name, reason)'}</label>
    <textarea id="workflow-proposal" rows={5} value={proposal} onChange={event=>setProposal(event.target.value)} style={{display:'block',width:'100%',fontFamily:'monospace',margin:'8px 0'}}/>
    <button disabled={disabled||!proposal.trim()} onClick={()=>void run(async()=>{if(proposal.length>1_000_000)throw new Error('Proposal exceeds 1 MB');await applyProposal(JSON.parse(proposal))})}>{zh?'验证并应用建议':'Validate and apply proposal'}</button>
    <div style={{marginTop:20}}><label htmlFor="workflow-probe">{zh?'预览最小 / 最大边界':'Preview minimum / maximum boundaries'}</label><select id="workflow-probe" disabled={disabled} value={active??''} onChange={event=>void run(()=>previewProbe(event.target.value))} style={{display:'block',maxWidth:'100%',margin:'8px 0'}}><option value="" disabled>{zh?'选择边界案例':'Choose a boundary case'}</option>{probes.map(probe=><option key={probe.id} value={probe.id}>{probe.slideIndex+1} · {probe.key} · {probe.boundary} = {probe.value}</option>)}</select>
    {!probes.length&&<p>{zh?'先为文本或动态列表添加有效标记，再生成边界案例。':'Add valid text or dynamic-list marks to generate boundary cases.'}</p>}
    {active&&<><p>{probes.find(probe=>probe.id===active)?.limitation}</p><label htmlFor="workflow-reason">{zh?'目视检查依据（必填）':'Visual review reason (required)'}</label><textarea id="workflow-reason" value={reason} onChange={event=>setReason(event.target.value)} maxLength={4000} rows={2} style={{display:'block',width:'100%',margin:'8px 0'}}/>{(['pass','fail'] as const).map(verdict=><button key={verdict} disabled={disabled||!reason.trim()} onClick={()=>void run(()=>recordObservation({probeId:active,snapshotId:snapshot!.snapshotId,verdict,reason}))} style={{marginRight:12}}>{verdict==='pass'?(zh?'记录通过':'Record pass'):(zh?'记录失败':'Record fail')}</button>)}<button onClick={()=>{setActive(null);activeRef.current=null;onPreview(null)}}>{zh?'恢复实际内容':'Restore actual content'}</button></>}
    <p aria-live="polite">{zh?'已记录':'Recorded'} {observations.length} / {probes.length} · {statusLabel}</p></div>
    <button disabled={disabled} onClick={()=>void run(release)}>{zh?'导出审查包（标记 PPTX + 审查 JSON）':'Export review bundle (marked PPTX + review JSON)'}</button>
    <p>{zh?'导出不代表审查通过。编译门禁由审查 JSON 的状态决定；失败或未检查的案例会阻止发布。':'Export does not mean review passed. The review JSON determines the compile gate; failed or unreviewed cases block release.'}</p>
    {error&&<p role="alert" className="pptx-error">{error}</p>}
  </section>;
}
