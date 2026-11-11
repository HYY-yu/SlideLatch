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

type Props={editorState:string;svgRef:React.RefObject<SVGSVGElement|null>;onCapacityPreview:(preview:{key:string;text:string}|null)=>void;model:LoadedTemplate;patches:Patches;fileName:string;busy:boolean;visibleProbeId:string|null;currentSlideIndex:number;onApply:(patches:Patches)=>void;onPreview:(probe:BoundaryProbe|null)=>void;onError:(message:string)=>void};
export default function WorkflowController(props:Props){
  const {model,patches,fileName,onApply}=props;
  const [snapshot,setSnapshot]=useState<WorkflowSnapshot|null>(null);
  const live=useRef(props);live.current=props;
  const mounted=useRef(true),urls=useRef<string[]>([]),mutationPending=useRef(false);
  const searchRef=useRef<AbortController|null>(null);
  const reportRef=useRef<Awaited<ReturnType<typeof searchTextCapacity>>|null>(null);
  const observationRef=useRef<BoundaryObservation[]>([]),activeRef=useRef<string|null>(null);
  const currentNodes=model.slides[props.currentSlideIndex]?.nodes??[];
  const childIds=new Set(currentNodes.flatMap(node=>node.children));
  const listKeys=new Set(slideLists(currentNodes,patches).flatMap(list=>list.items.flatMap(item=>item.nodes.map(node=>node.key))));
  const eligibleNodes=currentNodes.filter(node=>node.kind==='sp'&&!childIds.has(node.id)&&!listKeys.has(node.key)&&!node.parentId&&!node.rotation&&!node.flipH&&!node.flipV&&!node.dataKind&&!node.hasImage&&!!(node.hasTextBody||node.text)&&!!node.text.trim()&&!!node.box);
  function cancelCapacity(){searchRef.current?.abort();searchRef.current=null;live.current.onCapacityPreview(null);}
  useEffect(()=>{
    cancelCapacity();reportRef.current=null;
    return()=>{searchRef.current?.abort();live.current.onCapacityPreview(null)};
  },[model,patches,props.currentSlideIndex,props.busy,props.editorState]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;for(const url of urls.current)URL.revokeObjectURL(url)}},[]);
  useEffect(()=>{
    let cancelled=false;mutationPending.current=false;setSnapshot(null);activeRef.current=null;observationRef.current=[];live.current.onPreview(null);
    inspectWorkspace(model,patches).then(value=>{if(!cancelled)setSnapshot(value)}).catch(cause=>{
      if(!cancelled){console.error('[SlideLatch] workflow.inspect.failed',cause);live.current.onError(cause instanceof Error?cause.message:String(cause));}
    });
    return()=>{cancelled=true};
  },[model,patches]);
  const probes=snapshot?createBoundaryProbes(model,patches,snapshot.snapshotId):[];
  function assertCurrent(allowMutation=false){
    if(!allowMutation&&searchRef.current)throw new Error('Cancel the capacity search before changing workflow state.');
    if(!allowMutation&&mutationPending.current)throw new Error('A proposal is still being applied. Wait for the workspace update.');
    if(!mounted.current||live.current.model!==model||live.current.patches!==patches||live.current.busy||!snapshot)throw new Error('Workspace changed or has unfinished edits. Inspect again.');
  }
  async function inspect(){assertCurrent();return inspectWorkspace(model,patches)}
  function localRecognition(){assertCurrent();return recognizeStructure(snapshot!)}
  function recognitionRequest(){assertCurrent();return buildRecognitionRequest(snapshot!)}
  async function applyProposal(value:unknown){
    assertCurrent();
    if(value&&typeof value==='object'&&'marks' in value&&Array.isArray(value.marks)&&!value.marks.length&&(!('pages' in value)||!Array.isArray(value.pages)||!value.pages.length))throw new Error('No proposed changes. Review skipped objects or edit the proposal.');
    mutationPending.current=true;let committed=false;
    try{
      const fresh=await inspectWorkspace(model,patches);assertCurrent(true);
      const next=await applyMarkProposal(model,patches,fresh,value);assertCurrent(true);onApply(next);committed=true;return {applied:true};
    }finally{if(!committed)mutationPending.current=false;}
  }
  function previewProbe(id:string){
    assertCurrent();const probe=probes.find(item=>item.id===id);if(!probe)throw new Error('Unknown or stale probe');
    activeRef.current=id;live.current.onPreview(probe);return probe;
  }
  function recordObservation(input:{probeId:string;snapshotId:string;verdict:'pass'|'fail';reason:string}){
    assertCurrent();
    if(!input||typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>4000||!['pass','fail'].includes(input.verdict)||input.snapshotId!==snapshot!.snapshotId||input.probeId!==activeRef.current||input.probeId!==live.current.visibleProbeId||!probes.some(probe=>probe.id===input.probeId&&probe.slideIndex===live.current.currentSlideIndex))throw new Error('Preview the current probe and supply a pass/fail verdict with a reason.');
    const observation:BoundaryObservation={...input,reason:input.reason.trim(),renderer:'slidelatch-svg',observedAt:new Date().toISOString()};
    observationRef.current=[...observationRef.current.filter(item=>item.probeId!==input.probeId),observation];return observation;
  }
  function getReview(){assertCurrent();return createWorkflowReview(snapshot!,probes,observationRef.current)}
  async function runCapacity(input:{key:string;upper?:number}){
    assertCurrent();
    if(!input||!eligibleNodes.some(node=>node.key===input.key))throw new Error('Choose an ordinary, unrotated page-level text node on the current slide.');
    const upper=input.upper??128;if(!Number.isInteger(upper)||upper<1||upper>128)throw new Error('Search upper bound must be 1–128.');
    const controller=new AbortController(),slideIndex=props.currentSlideIndex,editorState=props.editorState;
    searchRef.current=controller;reportRef.current=null;
    const isCurrent=()=>mounted.current&&!controller.signal.aborted&&searchRef.current===controller&&live.current.model===model&&live.current.patches===patches&&!live.current.busy&&live.current.currentSlideIndex===slideIndex&&live.current.editorState===editorState;
    try{
      const result=await searchTextCapacity({snapshotId:snapshot!.snapshotId,key:input.key,lower:1,upper,samples:[{id:'semantic',seed:patches[input.key]?.text??eligibleNodes.find(node=>node.key===input.key)!.text}]},{signal:controller.signal,isCurrent,measure:async candidate=>{
        if(!isCurrent())throw new Error('Capacity search invalidated by editor changes.');
        flushSync(()=>live.current.onCapacityPreview({key:input.key,text:candidate.text}));
        const svg=live.current.svgRef.current;if(!svg)throw new Error('Current SVG editor is unavailable.');
        const evidence=await measurePreviewText(svg,input.key,{signal:controller.signal,isCurrent});
        if(!isCurrent())throw new Error('Capacity search invalidated by editor changes.');return evidence;
      }});
      if(isCurrent())reportRef.current=result;return result;
    }finally{if(searchRef.current===controller){searchRef.current=null;live.current.onCapacityPreview(null);}}
  }
  function proposeMeasuredRange(min:number){
    assertCurrent();const report=reportRef.current;
    if(!report||report.snapshotId!==snapshot!.snapshotId||report.status!=='complete'||report.recommendedMax===null||!eligibleNodes.some(node=>node.key===report.key))throw new Error('No current measured maximum is available.');
    if(!Number.isSafeInteger(min)||min<0||min>report.recommendedMax)throw new Error('Supply a semantic minimum between zero and the measured candidate maximum.');
    return {schemaVersion:1,templateSha256:snapshot!.templateSha256,snapshotId:snapshot!.snapshotId,marks:[{key:report.key,name:`@文本[${min}-${report.recommendedMax}]`,reason:`Semantic minimum explicitly supplied as ${min}; maximum ${report.recommendedMax} is only a candidate from finite SVG layout measurements. Visual review and compiler validation remain required.`}]};
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
    const api={inspect,applyProposal,previewProbe,recordObservation,getReview,recognizeStructure:localRecognition,buildRecognitionRequest:recognitionRequest,searchTextCapacity:runCapacity,cancelCapacitySearch:cancelCapacity,proposeMeasuredRange,getCapacityReport:()=>reportRef.current,exportReviewBundle};
    const host=window as unknown as {slidelatchWorkflow?:typeof api};host.slidelatchWorkflow=api;
    return()=>{if(host.slidelatchWorkflow===api)delete host.slidelatchWorkflow};
  });
  return null;
}
