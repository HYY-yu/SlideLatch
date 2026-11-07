import { bestComponentAssignment } from '../../packages/ppt-dsl/src/component-matching.ts';
import { meaningfulTextLength } from '../../packages/ppt-dsl/src/text-length.ts';
import { validatePageContract, pagePatchKey } from './page-contract.ts';
import { parseMark, markError } from '../pptx/dsl.ts';
import { allowedMarkTypes } from '../pptx/marking.ts';
import { slideLists } from '../pptx/lists.ts';
import { validateWorkspace } from '../pptx/validation.ts';
import type { LoadedTemplate, Patches, SourceNode, RenderElement, PageContract } from '../pptx/types.ts';

export const WORKFLOW_LIMITATIONS = [
  'SlideLatch SVG is an approximate preview, not native PowerPoint rendering.',
  'Boundary samples are observations, not proof that every text, font, language or list layout fits.',
  'Native Office opening, font substitution, animations and complex effects are not verified.',
  'Automatic semantic recognition and remote model orchestration are not included; AI proposals require this explicit contract.',
];
export type WorkflowSnapshot = {
  schemaVersion: 1; product: 'SlideLatch'; protocol: 'ppt-node-dsl';
  templateSha256: string; snapshotId: string;
  slides: {slideIndex:number;path:string;note:string;pageContract?:PageContract;nodes:(SourceNode & {allowedMarks:string[]})[]}[];
  issues:string[]; mappingWarnings:string[]; limitations:string[];
};
export type MarkProposal = {schemaVersion:1;templateSha256:string;snapshotId:string;marks?:{key:string;name:string;reason:string}[];pages?:({path:string;reason:string}&PageContract)[]};
export type BoundaryProbe = {
  id:string;snapshotId:string;key:string;slideIndex:number;kind:'text'|'list';
  boundary:'min'|'max';value:number;text?:string;listKey?:string;limitation:string;
};
export type BoundaryObservation = {
  probeId:string;snapshotId:string;verdict:'pass'|'fail';reason:string;
  renderer:'slidelatch-svg';observedAt:string;
};
export type WorkflowReview = {
  schemaVersion:1;product:'SlideLatch';protocol:'ppt-node-dsl';sourceTemplateSha256:string;snapshotId:string;
  templateSha256?:string;status:'invalid'|'needs_review'|'ready_for_compile';
  programmatic:{issues:string[];mappingWarnings:string[]};probes:BoundaryProbe[];observations:BoundaryObservation[];
  limitations:string[];visualGuarantee:false;nativeOfficeValidation:'not_run';
};
function canonical(value:unknown):string {
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value as Record<string,unknown>).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}
export async function sha256Bytes(bytes:ArrayBuffer|Uint8Array):Promise<string>{
  const digest=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes instanceof ArrayBuffer?bytes:bytes));
  return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
}
export async function inspectWorkspace(model:LoadedTemplate,patches:Patches):Promise<WorkflowSnapshot>{
  const snapshotId=await sha256Bytes(new TextEncoder().encode(canonical({templateSha256:model.sha256,patches})));
  return {
    schemaVersion:1,product:'SlideLatch',protocol:'ppt-node-dsl',templateSha256:model.sha256,snapshotId,
    slides:model.slides.map((slide,slideIndex)=>({slideIndex,path:slide.path,note:model.deck.slides[slideIndex]?.note??'',pageContract:structuredClone(patches[pagePatchKey(slide.path)]?.pageContract??slide.pageContract),nodes:slide.nodes.map(node=>({...structuredClone(node),
      name:patches[node.key]?.name??node.name,text:patches[node.key]?.text??node.text,box:structuredClone(patches[node.key]?.box??node.box),
      marked:(patches[node.key]?.name??node.name).trim().startsWith('@'),allowedMarks:allowedMarkTypes(node),
    }))})),
    issues:[...validateWorkspace(model.slides,patches),...resolveProbeContracts(model,patches).issues],mappingWarnings:model.slides.flatMap((slide,i)=>{
      const rendered=new Set<string>();const visit=(nodes:RenderElement[])=>{for(const node of nodes){if(node.id)rendered.add(String(node.id));if(node.elements)visit(node.elements);}};
      visit(model.deck.slides[i]?.elements??[]);
      return slide.nodes.filter(node=>(patches[node.key]?.name??node.name).trim().startsWith('@')&&!rendered.has(node.id)).map(node=>node.key);
    }),limitations:[...WORKFLOW_LIMITATIONS],
  };
}
function object(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function keysOnly(value:Record<string,unknown>,keys:string[]){if(Object.keys(value).some(key=>!keys.includes(key)))throw new Error('PROPOSAL_UNKNOWN_FIELD');}
/** Apply only names and bounded page semantics, never arbitrary notes or shape content. */
export async function applyMarkProposal(model:LoadedTemplate,patches:Patches,snapshot:WorkflowSnapshot,proposal:unknown):Promise<Patches>{
  const current=await inspectWorkspace(model,patches);
  if(snapshot.snapshotId!==current.snapshotId||snapshot.templateSha256!==model.sha256)throw new Error('PROPOSAL_STALE_SNAPSHOT');
  if(!object(proposal))throw new Error('PROPOSAL_SCHEMA');
  keysOnly(proposal,['schemaVersion','templateSha256','snapshotId','marks','pages']);
  if(proposal.schemaVersion!==1||proposal.templateSha256!==model.sha256||proposal.snapshotId!==current.snapshotId)throw new Error('PROPOSAL_STALE_SNAPSHOT');
  if(proposal.marks!==undefined&&!Array.isArray(proposal.marks)||proposal.pages!==undefined&&!Array.isArray(proposal.pages))throw new Error('PROPOSAL_MARKS');
  const marks=proposal.marks as unknown[]|undefined??[],pages=proposal.pages as unknown[]|undefined??[];
  if(!marks.length&&!pages.length||marks.length>5000||pages.length>model.slides.length)throw new Error('PROPOSAL_MARKS');
  const nodes=new Map(model.slides.flatMap(slide=>slide.nodes).map(node=>[node.key,node]));
  const seen=new Set<string>(),next={...patches};
  for(const item of marks){
    if(!object(item))throw new Error('PROPOSAL_MARK');
    keysOnly(item,['key','name','reason']);
    if(typeof item.key!=='string'||typeof item.name!=='string'||typeof item.reason!=='string'||!item.reason.trim()||item.reason.length>2000)throw new Error('PROPOSAL_MARK');
    if(seen.has(item.key))throw new Error('PROPOSAL_DUPLICATE_TARGET');seen.add(item.key);
    const node=nodes.get(item.key);if(!node)throw new Error('PROPOSAL_UNKNOWN_TARGET');
    const name=item.name.trim(),mark=parseMark(name);
    if(!name||name.length>240||/[\u0000-\u001f]/.test(name)||markError(mark))throw new Error('PROPOSAL_INVALID_MARK');
    if(mark.type!=='fixed'&&!allowedMarkTypes(node).includes(mark.type as ReturnType<typeof allowedMarkTypes>[number]))throw new Error('PROPOSAL_MARK_TYPE_MISMATCH');
    next[item.key]={...next[item.key],name};
  }
  const slidePaths=new Set(model.slides.map(s=>s.path));
  for(const item of pages){
    if(!object(item))throw new Error('PROPOSAL_PAGE');
    keysOnly(item,['path','pageType','logic','reason']);
    if(typeof item.path!=='string'||typeof item.reason!=='string'||!item.reason.trim()||item.reason.length>2000)throw new Error('PROPOSAL_PAGE');
    if(!slidePaths.has(item.path))throw new Error('PROPOSAL_UNKNOWN_TARGET');
    const key=pagePatchKey(item.path);
    if(seen.has(key))throw new Error('PROPOSAL_DUPLICATE_TARGET');seen.add(key);
    const pageContract=validatePageContract({pageType:item.pageType,logic:item.logic});
    next[key]={pageContract};
  }
  const issues=validateWorkspace(model.slides,next);if(issues.length)throw new Error(`PROPOSAL_WORKSPACE_INVALID: ${issues.join('; ')}`);
  return next;
}
const MAX_PROBE_TEXT=10000;
function sampleText(node:SourceNode,length:number,patches:Patches):string {
  const seed=Array.from((patches[node.key]?.text??node.text).normalize('NFC').replace(/[\p{C}\p{Z}\s]+/gu,' ').trim()||'示例 Sample W');
  const count=Math.min(length,MAX_PROBE_TEXT),result=Array.from({length:count},(_,i)=>seed[i%seed.length]);
  // A trailing space is not counted by the protocol. Replace it with a visible sample character.
  if(result.at(-1)===' ')result[result.length-1]=seed[0];
  const text=result.join(''),metric=meaningfulTextLength(text);
  if(metric.length!==count||metric.hasInvalidCharacters)throw new Error('PROBE_SAMPLE_LENGTH');
  return text;
}
function resolveProbeContracts(model:LoadedTemplate,patches:Patches){
  const issues:string[]=[],ranges=new Map<string,{min:number;max:number}>();
  for(const slide of model.slides){
    const nameOf=(node:SourceNode)=>patches[node.key]?.name??node.name;
    const contract=(node:SourceNode)=>{const mark=parseMark(nameOf(node)),box=patches[node.key]?.box??node.box;return {node,sampleContent:patches[node.key]?.text??node.text,
      length:mark.type==='text'&&!markError(mark)&&/\[\d+(?:-\d+)?\]/.test(nameOf(node))?{min:mark.min,max:mark.max}:undefined,
      locator:{box:box?{cx:Math.round(box.width*12700),cy:Math.round(box.height*12700)}:undefined}};};
    for(const node of slide.nodes){const c=contract(node);if(c.length)ranges.set(node.key,c.length);}
    for(const list of slideLists(slide.nodes,patches)){
      const first=list.items[0].nodes.filter(n=>parseMark(nameOf(n)).type==='text').map(contract);
      for(const item of list.items.slice(1)){
        const candidates=item.nodes.filter(n=>parseMark(nameOf(n)).type==='text').map(contract);
        try{
          const {assignment,ambiguous}=bestComponentAssignment(first,candidates);
          if(ambiguous){issues.push(`${list.key}: AMBIGUOUS_COMPONENT_CONTRACT`);continue;}
          assignment.forEach((candidate,i)=>{
            const range=candidate.length??first[i].length;
            if(candidate.length&&first[i].length&&(candidate.length.min!==first[i].length!.min||candidate.length.max!==first[i].length!.max))issues.push(`${candidate.node.key}: INCONSISTENT_TEXT_CONTRACT`);
            if(range)ranges.set(candidate.node.key,range);
          });
        }catch(error){issues.push(`${list.key}: ${error instanceof Error?error.message:String(error)}`);}
      }
    }
  }
  return {ranges,issues};
}
/** Exact compiler-compatible text contracts; grouped fixed lists also carry count endpoints. */
export function createBoundaryProbes(model:LoadedTemplate,patches:Patches,snapshotId:string):BoundaryProbe[]{
  const probes:BoundaryProbe[]=[],{ranges}=resolveProbeContracts(model,patches);
  for(const [slideIndex,slide]of model.slides.entries()){
    for(const list of slideLists(slide.nodes,patches))if(list.grouped)for(const boundary of ['min','max'] as const)probes.push({id:`${list.key}:${boundary}`,snapshotId,key:list.controller.key,slideIndex,kind:'list',boundary,value:list[boundary],listKey:list.key,
      limitation:'SVG list-count preview is approximate and does not use the native generator layout. Only the first 100 items are rendered.'});
    for(const node of slide.nodes){const range=ranges.get(node.key);if(!range)continue;
      for(const boundary of ['min','max'] as const)probes.push({id:`${node.key}:text:${boundary}`,snapshotId,key:node.key,slideIndex,kind:'text',boundary,value:range[boundary],text:sampleText(node,range[boundary],patches),
        limitation:range[boundary]>MAX_PROBE_TEXT?'Boundary exceeds safe preview limit and cannot be approved.':'Sample uses repeated existing semantic text. Different content can have different line wrapping.'});
    }
  }
  return probes;
}
export function createWorkflowReview(snapshot:WorkflowSnapshot,probes:BoundaryProbe[],observations:BoundaryObservation[],templateSha256?:string):WorkflowReview{
  const expected=createBoundaryProbes({bytes:new ArrayBuffer(0),sha256:snapshot.templateSha256,mappingWarnings:snapshot.mappingWarnings,
    slides:snapshot.slides.map(s=>({path:s.path,nodes:s.nodes})),deck:{slides:[],size:{width:0,height:0},themeColors:[]}}, {}, snapshot.snapshotId);
  const probeShape=(p:BoundaryProbe)=>canonical({id:p.id,key:p.key,slideIndex:p.slideIndex,kind:p.kind,boundary:p.boundary,value:p.value,text:p.text,listKey:p.listKey});
  const complete=probes.length===expected.length&&new Set(probes.map(p=>p.id)).size===probes.length&&expected.every(p=>probes.some(candidate=>probeShape(candidate)===probeShape(p)));
  const current=probes.filter(p=>p.snapshotId===snapshot.snapshotId);
  const valid=observations.filter(o=>o.snapshotId===snapshot.snapshotId&&current.some(p=>p.id===o.probeId)&&o.renderer==='slidelatch-svg'&&['pass','fail'].includes(o.verdict)&&typeof o.reason==='string'&&!!o.reason.trim()&&Number.isFinite(Date.parse(o.observedAt)));
  const latest=new Map(valid.map(o=>[o.probeId,o]));
  const reviewed=complete&&current.length>0&&current.length===probes.length&&current.every(p=>latest.get(p.id)?.verdict==='pass'&&(p.kind==='text'?p.value<=MAX_PROBE_TEXT:p.value<=100));
  const invalid=snapshot.issues.length>0||snapshot.mappingWarnings.length>0;
  return {schemaVersion:1,product:'SlideLatch',protocol:'ppt-node-dsl',sourceTemplateSha256:snapshot.templateSha256,snapshotId:snapshot.snapshotId,
    ...(templateSha256?{templateSha256}:{}),status:invalid?'invalid':reviewed&&/^[a-f0-9]{64}$/.test(templateSha256??'')?'ready_for_compile':'needs_review',
    programmatic:{issues:[...snapshot.issues],mappingWarnings:[...snapshot.mappingWarnings]},probes:current,observations:[...latest.values()],
    limitations:[...WORKFLOW_LIMITATIONS,'Only explicit text ranges, inherited list text ranges and dynamic list endpoints have boundary probes. Images, charts, tables and unmarked objects are not visually certified.'],
    visualGuarantee:false,nativeOfficeValidation:'not_run'};
}
