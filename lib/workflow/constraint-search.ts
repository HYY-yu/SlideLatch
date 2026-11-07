/** Finite renderer observations, never a semantic minimum or visual certification. */
export const MAX_SEARCH_WINDOW = 128;
export const MAX_SEARCH_LENGTH = 10000;
export type TextMeasureEvidence = {
  fits: boolean | null; reason: string;
  width?: number; height?: number; contentWidth?: number; contentHeight?: number;
  [key: string]: unknown;
};
export type TextCapacityCandidate = {snapshotId:string;key:string;length:number;sampleId:string;text:string};
export type TextCapacityInput = {snapshotId:string;key:string;lower:number;upper:number;samples?:{id:string;seed:string}[]};
export type TextCapacityReport = {
  snapshotId:string;key:string;lower:number;upper:number;
  status:'complete'|'cancelled'|'stale'|'inconclusive';
  candidates:(TextCapacityCandidate & {evidence:TextMeasureEvidence})[];
  feasibleRanges:{min:number;max:number}[];recommendedMax:number|null;
  visualGuarantee:false;nativeOfficeValidation:'not_run';limitations:string[];
};
export function stressText(seed:string,length:number):string {
  // No invisible padding, controls or format characters. Length is Unicode code points, not UTF-16 units.
  const points=Array.from(seed.normalize('NFC').replace(/[\p{C}\p{Z}\s]/gu,''));
  if(!Number.isSafeInteger(length)||length<0||length>MAX_SEARCH_LENGTH||!points.length)throw new Error('SEARCH_INVALID_SAMPLE');
  return Array.from({length},(_,i)=>points[i%points.length]).join('');
}
export async function searchTextCapacity(input:TextCapacityInput,options:{
  measure:(candidate:TextCapacityCandidate)=>Promise<TextMeasureEvidence>;
  signal?:AbortSignal;isCurrent?:()=>boolean;
}):Promise<TextCapacityReport>{
  const {snapshotId,key,lower,upper}=input;
  if(typeof snapshotId!=='string'||!snapshotId.trim()||typeof key!=='string'||!key.trim()||
    !Number.isSafeInteger(lower)||!Number.isSafeInteger(upper)||lower<0||upper<lower||upper>MAX_SEARCH_LENGTH||upper-lower+1>MAX_SEARCH_WINDOW)throw new Error('SEARCH_INVALID_BOUNDS');
  if(input.samples!==undefined&&(!Array.isArray(input.samples)||input.samples.length>6))throw new Error('SEARCH_INVALID_SAMPLES');
  const samples=input.samples?.length?[...input.samples]:[{id:'semantic',seed:'示例Sample'}];
  const ids=new Set<string>();
  for(const sample of samples){
    if(!sample||typeof sample.id!=='string'||!sample.id.trim()||ids.has(sample.id)||['cjk-wide','latin-wide'].includes(sample.id)||typeof sample.seed!=='string'||sample.seed.length>MAX_SEARCH_LENGTH*2)throw new Error('SEARCH_INVALID_SAMPLES');
    stressText(sample.seed,0);ids.add(sample.id);
  }
  samples.push({id:'cjk-wide',seed:'疆體鬱國寬'},{id:'latin-wide',seed:'WMQMW'});
  const report:TextCapacityReport={snapshotId,key,lower,upper,status:'complete',candidates:[],feasibleRanges:[],recommendedMax:null,
    visualGuarantee:false,nativeOfficeValidation:'not_run',limitations:[
      'The lower bound is supplied by the user or semantic contract, never inferred from overflow.',
      'Only block layout and scroll fit for these finite strings and lengths were measured in the approximate SVG renderer. Font range overhang is reported separately and requires visual review.',
      'A passing upper endpoint is the end of the tested window, not a proven capacity ceiling.',
      'Recommended maximum covers only a continuous passing prefix of the requested window; candidate contracts are not automatically applied or visually approved.',
    ]};
  const stopped=()=>options.signal?.aborted?'cancelled':options.isCurrent&&!options.isCurrent()?'stale':null;
  let unknown=false;
  outer:for(let length=lower;length<=upper;length++){
    let fits=true;
    for(const sample of samples){
      const before=stopped();if(before){report.status=before;break outer;}
      const candidate={snapshotId,key,length,sampleId:sample.id,text:stressText(sample.seed,length)};
      let evidence:TextMeasureEvidence;
      try{evidence=await options.measure(candidate);}catch(error){evidence={fits:null,reason:`Measurement failed: ${error instanceof Error?error.message:String(error)}`};}
      const after=stopped();
      if(!evidence||![true,false,null].includes(evidence.fits)||typeof evidence.reason!=='string'||!evidence.reason.trim())evidence={fits:null,reason:'Renderer returned invalid evidence.'};
      // Retain every attempted measurement, but invalidate observations obtained after cancellation/editing.
      if(after)evidence={...evidence,fits:null,reason:`Measurement invalidated: ${after}.`};
      report.candidates.push({...candidate,evidence});
      if(after){report.status=after;break outer;}
      if(evidence.fits===null)unknown=true;
      if(evidence.fits!==true)fits=false;
    }
    if(fits){const last=report.feasibleRanges.at(-1);if(last&&last.max===length-1)last.max=length;else report.feasibleRanges.push({min:length,max:length});}
  }
  if(report.status==='complete'&&unknown)report.status='inconclusive';
  // Incomplete/stale reports are evidence only, not recommendations.
  if(report.status==='complete'&&report.feasibleRanges[0]?.min===lower)report.recommendedMax=report.feasibleRanges[0].max;
  return report;
}
