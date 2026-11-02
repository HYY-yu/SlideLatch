import type {AnalyticsEvent,AnalyticsProperties} from '../analytics/events.ts';
export type TrialSource='header'|'results'|'footer'|'support_survey';
export const defaultTrialFormId='7XqVaa';
export function trialFormId(value:string|undefined):string{
 const id=value?.trim()||defaultTrialFormId;
 if(!/^[A-Za-z0-9]{5,24}$/.test(id))throw new Error('INVALID_TALLY_FORM_ID');
 return id;
}
export type TallyOptions={layout:'modal';width:number;alignLeft:boolean;hideTitle:boolean;overlay:boolean;onOpen:()=>void;onClose:()=>void;onSubmit:(payload:unknown)=>void};
export type TallySDK={openPopup:(formId:string,options:TallyOptions)=>void;closePopup:(formId:string)=>void};
declare global{interface Window{Tally?:TallySDK}}
let sdkPromise:Promise<TallySDK>|undefined;
/** Load the official widget only after a visitor requests the application form. */
export function loadTallySDK():Promise<TallySDK>{
 if(typeof window==='undefined')return Promise.reject(new Error('TALLY_BROWSER_REQUIRED'));
 if(window.Tally)return Promise.resolve(window.Tally);
 if(sdkPromise)return sdkPromise;
 sdkPromise=new Promise<TallySDK>((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://tally.so/widgets/embed.js';script.async=true;script.referrerPolicy='strict-origin';
  const timer=setTimeout(()=>finish(new Error('TALLY_SCRIPT_TIMEOUT')),15000);
  function finish(error?:Error){
   clearTimeout(timer);script.onload=null;script.onerror=null;
   if(error){script.remove();reject(error);}else if(window.Tally)resolve(window.Tally);else{script.remove();reject(new Error('TALLY_SDK_MISSING'));}
  }
  script.onload=()=>finish();script.onerror=()=>finish(new Error('TALLY_SCRIPT_LOAD_FAILED'));document.head.appendChild(script);
 }).catch(error=>{sdkPromise=undefined;throw error;});
 return sdkPromise;
}
/** Submission callbacks may contain private answers. Only form identity and lifecycle enter analytics. */
export function createTallyLifecycle(formId:string,source:TrialSource,locale:'zh'|'en',capture:(event:AnalyticsEvent,props:AnalyticsProperties)=>void){
 let opened=false,closed=false,submitted=false;
 const properties={form_id:formId,entry_point:source,locale};
 return {
  onOpen(){if(opened||closed)return;opened=true;capture('survey_form_opened',properties);},
  onSubmit(payload:unknown){
   if(!opened||closed||submitted)return false;
   if(!payload||typeof payload!=='object'||(payload as {formId?:unknown}).formId!==formId){console.warn('[SlideLatch] trial.callback.rejected',{reason:'form_mismatch'});return false;}
   submitted=true;capture('survey_submitted',properties);console.info('[SlideLatch] trial.submitted',{formId});return true;
  },
  onClose(){if(closed)return;closed=true;if(opened)capture('survey_form_closed',{...properties,outcome:submitted?'submitted':'abandoned'});},
 };
}
