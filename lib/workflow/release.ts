import { createBoundaryProbes, createWorkflowReview, sha256Bytes, type WorkflowReview, type BoundaryProbe, type BoundaryObservation, type WorkflowSnapshot } from './session.ts';
import { readSourceSlides } from '../pptx/xml.ts';
import { validateWorkspace } from '../pptx/validation.ts';

/** Re-check byte binding, actual OOXML contracts and complete boundary coverage before compilation. */
export async function validateReleaseReview(bytes:Uint8Array,review:unknown):Promise<WorkflowReview>{
  if(!review||typeof review!=='object'||Array.isArray(review))throw new Error('RELEASE_REVIEW_SCHEMA');
  const report=review as WorkflowReview;
  if(report.schemaVersion!==1||report.product!=='SlideLatch'||report.protocol!=='ppt-node-dsl'||report.status!=='ready_for_compile'||report.visualGuarantee!==false||report.nativeOfficeValidation!=='not_run')throw new Error('RELEASE_NOT_READY');
  if(!/^[a-f0-9]{64}$/.test(report.snapshotId??'')||!/^[a-f0-9]{64}$/.test(report.sourceTemplateSha256??''))throw new Error('RELEASE_IDENTITY');
  const digest=await sha256Bytes(bytes);if(report.templateSha256!==digest)throw new Error('RELEASE_TEMPLATE_HASH_MISMATCH');
  if(!Array.isArray(report.programmatic?.issues)||!Array.isArray(report.programmatic?.mappingWarnings)||report.programmatic.issues.length||report.programmatic.mappingWarnings.length)throw new Error('RELEASE_PROGRAMMATIC_FAILURE');
  if(!Array.isArray(report.probes)||!Array.isArray(report.observations)||!report.probes.length)throw new Error('RELEASE_MISSING_EVIDENCE');
  const slides=await readSourceSlides(bytes),issues=validateWorkspace(slides,{});
  if(issues.length)throw new Error(`RELEASE_INVALID_MARKS: ${issues.join('; ')}`);
  const model={bytes:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer,sha256:digest,slides,mappingWarnings:[],deck:{slides:[],size:{width:0,height:0},themeColors:[]}};
  const expected=createBoundaryProbes(model,{},report.snapshotId);
  // Use an authoritative snapshot parsed from the exact file, never the submitted list of expected targets.
  const snapshot:WorkflowSnapshot={schemaVersion:1,product:'SlideLatch',protocol:'ppt-node-dsl',templateSha256:report.sourceTemplateSha256,snapshotId:report.snapshotId,
    slides:slides.map((slide,slideIndex)=>({...slide,slideIndex,note:'',nodes:slide.nodes.map(n=>({...n,allowedMarks:[]}))})),issues:[],mappingWarnings:[],limitations:[]};
  const observations=report.observations as BoundaryObservation[];
  if(observations.some(o=>!o||typeof o!=='object'||o.snapshotId!==report.snapshotId||o.renderer!=='slidelatch-svg'||!['pass','fail'].includes(o.verdict)||typeof o.reason!=='string'||!o.reason.trim()||!Number.isFinite(Date.parse(o.observedAt))))throw new Error('RELEASE_INVALID_OBSERVATION');
  if(new Set(observations.map(o=>o.probeId)).size!==observations.length||observations.some(o=>!expected.some(p=>p.id===o.probeId)))throw new Error('RELEASE_UNEXPECTED_OBSERVATION');
  if(report.probes.some((p:BoundaryProbe)=>!p||typeof p!=='object'))throw new Error('RELEASE_INVALID_PROBE');
  const checked=createWorkflowReview(snapshot,report.probes,observations,digest);
  if(checked.status!=='ready_for_compile')throw new Error('RELEASE_INCOMPLETE_BOUNDARY_REVIEW');
  return checked;
}
