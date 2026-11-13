'use client';
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import type {Locale} from '@/lib/i18n';
import { dismissDialogOnBackdrop } from '@/lib/dialog';
import {track} from '@/lib/analytics/browser';
import {loadTallySDK,trialFormId,createTallyLifecycle,type TrialSource} from '@/lib/engagement/tally';
import {createHeartParticles,type HeartParticle} from '@/lib/engagement/heart-particles';
import {dismissSupportInvitation,emptySupport,likeSupport,restoreSupport,serializeSupport,supportStorageKey,type SupportState} from '@/lib/engagement/support';

const TrialContext=createContext<{open:(source:TrialSource)=>Promise<void>;loading:boolean}|null>(null);
const copy={
 zh:{support:'支持一下',yourLikes:'你送出的赞',title:'喜欢这个方向？',hint:'送个赞，或告诉我你想怎样使用它。',trial:'申请试用',invite:'愿意做个小调查，帮我把它做好吗？',yes:'愿意',later:'暂时不了',opening:'正在打开…',loadError:'申请表暂时没有打开',loadHint:'可能是网络或浏览器拦截。你可以重试，或直接打开表单。',retry:'重试',direct:'直接打开表单 ↗',close:'关闭'},
 en:{support:'Send some love',yourLikes:'Likes you sent',title:'Like where this is going?',hint:'Send some love, or tell me how you would use it.',trial:'Apply for early access',invite:'Would you take a short survey to help make this better?',yes:'Sure',later:'Not now',opening:'Opening…',loadError:'The application form did not open',loadHint:'A network issue or browser blocker may be the cause. Try again or open the form directly.',retry:'Try again',direct:'Open the form directly ↗',close:'Close'},
};
export function EngagementProvider({locale,children}:{locale:Locale;children:ReactNode}){
 const t=copy[locale],dialog=useRef<HTMLDialogElement>(null),[loading,setLoading]=useState(false);
 const busy=useRef(false),mounted=useRef(true),lastSource=useRef<TrialSource>('results'),openingTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const id=trialFormId(process.env.NEXT_PUBLIC_TALLY_FORM_ID);
 function clearOpeningTimer(){if(openingTimer.current){clearTimeout(openingTimer.current);openingTimer.current=null;}}
 useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;clearOpeningTimer();if(busy.current)window.Tally?.closePopup(id);};},[id]);
 async function openTrial(source:TrialSource){
  if(busy.current)return;
  busy.current=true;lastSource.current=source;setLoading(true);dialog.current?.close();
  track('trial_cta_clicked',{entry_point:source,form_id:id});
  const lifecycle=createTallyLifecycle(id,source,locale,track);
  function fail(error:unknown){
   clearOpeningTimer();console.warn('[SlideLatch] trial.open.failed',error);
   track('survey_form_load_failed',{entry_point:source,form_id:id,reason:'tally_load_failed'});
   busy.current=false;if(mounted.current){setLoading(false);if(!dialog.current?.open)dialog.current?.showModal();}
  }
  try{
   const tally=await loadTallySDK();if(!mounted.current){busy.current=false;return;}
   console.info('[SlideLatch] trial.open.requested',{formId:id,source});
   openingTimer.current=setTimeout(()=>{tally.closePopup(id);fail(new Error('TALLY_OPEN_TIMEOUT'));},15000);
   tally.openPopup(id,{layout:'modal',width:640,alignLeft:true,hideTitle:false,overlay:true,
    onOpen:()=>{clearOpeningTimer();lifecycle.onOpen();if(mounted.current)setLoading(false);},
    onClose:()=>{clearOpeningTimer();lifecycle.onClose();busy.current=false;if(mounted.current)setLoading(false);},
    onSubmit:payload=>{lifecycle.onSubmit(payload);},
   });
  }catch(error){fail(error);}
 }
 return <TrialContext.Provider value={{open:openTrial,loading}}>{children}<dialog ref={dialog} className="trial-dialog" aria-labelledby="trial-dialog-title" aria-describedby="trial-dialog-hint" closedby="any" onClick={dismissDialogOnBackdrop}>
  <button className="trial-dialog-close" onClick={()=>dialog.current?.close()} aria-label={t.close}>×</button>
  <span className="trial-dialog-symbol" aria-hidden="true">↗</span><h2 id="trial-dialog-title">{t.loadError}</h2><p id="trial-dialog-hint">{t.loadHint}</p>
  <div className="trial-recovery-actions"><button className="button button-primary" onClick={()=>void openTrial(lastSource.current)}>{t.retry}</button><a href={`https://tally.so/r/${id}`} target="_blank" rel="noopener noreferrer">{t.direct}</a></div>
 </dialog></TrialContext.Provider>;
}
export function TrialButton({locale,source,className='button button-primary'}:{locale:Locale;source:TrialSource;className?:string}){
 const context=useContext(TrialContext);
 return <button className={className} disabled={context?.loading} onClick={()=>void context?.open(source)}>{context?.loading?copy[locale].opening:copy[locale].trial}</button>;
}
function Heart({filled=false}:{filled?:boolean}){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" fill={filled?'currentColor':'none'} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>;}
function FloatingHeart({particle}:{particle:HeartParticle}){
 const ref=useRef<HTMLSpanElement>(null);
 useEffect(()=>{
  if(!ref.current)return;
  const animation=ref.current.animate(particle.frames,{duration:particle.duration,delay:particle.delay,easing:'cubic-bezier(.16,.5,.35,1)',fill:'both'});
  return ()=>animation.cancel();
 },[particle]);
 return <span ref={ref} style={{width:particle.size,height:particle.size,color:particle.color}}><Heart filled/></span>;
}
export function SupportWidget({locale}:{locale:Locale}){
 const t=copy[locale],openTrial=useContext(TrialContext),[state,setState]=useState<SupportState>({...emptySupport}),[ready,setReady]=useState(false),[bursts,setBursts]=useState<{id:number;particles:HeartParticle[]}[]>([]);
 const current=useRef(state),sequence=useRef(0),timers=useRef(new Set<ReturnType<typeof setTimeout>>()),storageFailed=useRef(false);
 useEffect(()=>{
  try{const restored=restoreSupport(sessionStorage.getItem(supportStorageKey));current.current=restored;setState(restored);}
  catch(error){console.warn('[SlideLatch] support.restore.failed',error);}
  setReady(true);
  const active=timers.current;return ()=>{for(const timer of active)clearTimeout(timer);};
 },[]);
 function update(next:SupportState){
  current.current=next;setState(next);
  if(storageFailed.current)return;
  try{sessionStorage.setItem(supportStorageKey,serializeSupport(next));}catch(error){storageFailed.current=true;console.warn('[SlideLatch] support.persist.failed',error);}
 }
 function like(){
  const before=current.current,next=likeSupport(before);update(next);track('support_clicked',{like_count:next.likes,entry_point:'results'});
  if(!before.invitationOpen&&next.invitationOpen)track('survey_invitation_shown',{like_count:next.likes});
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const id=++sequence.current,particles=createHeartParticles();setBursts(previous=>[...previous.slice(-5),{id,particles}]);
  const lifetime=Math.max(...particles.map(p=>p.duration+p.delay))+80;
  const timer=setTimeout(()=>{setBursts(previous=>previous.filter(value=>value.id!==id));timers.current.delete(timer);},lifetime);timers.current.add(timer);
 }
 function dismiss(accept:boolean){
  update(dismissSupportInvitation(current.current));
  track(accept?'survey_invitation_accepted':'survey_invitation_dismissed',{like_count:current.current.likes});
  if(accept)void openTrial?.open('support_survey');
 }
 return <div className="support-section"><div className="support-intro"><h3>{t.title}</h3><p>{t.hint}</p></div><div className="support-actions"><div className="support-control">
  {state.invitationOpen&&<div className="survey-invitation" role="region" aria-label={t.invite}><p role="status">{t.invite}</p><div><button onClick={()=>dismiss(true)}>{t.yes} <span aria-hidden="true">↗</span></button><button onClick={()=>dismiss(false)}>{t.later}</button></div></div>}
  <button className={`support-button${state.likes?' has-likes':''}`} disabled={!ready} onClick={like} aria-label={t.support} aria-describedby="support-count"><span className="support-heart" key={state.likes}><Heart filled={state.likes>0}/></span><span>{t.support}</span><output aria-hidden="true">{state.likes.toLocaleString(locale==='zh'?'zh-CN':'en-US')}</output></button>
  <span id="support-count" className="support-count" aria-live="polite">{t.yourLikes} · {state.likes.toLocaleString(locale==='zh'?'zh-CN':'en-US')}</span>
  <div className="heart-bursts" aria-hidden="true">{bursts.map(burst=><span className="heart-burst" key={burst.id}>{burst.particles.map((particle,i)=><FloatingHeart key={i} particle={particle}/>)}</span>)}</div>
 </div><TrialButton locale={locale} source="results" className="button button-primary support-trial"/></div></div>;
}
