'use client';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { scrubbedValue } from '@/lib/pptx/number-scrub';
import { editorCopy } from '@/lib/pptx/copy';
import type { Locale } from '@/lib/i18n';

type Props = { min:number; max:number; onChange:(key:'min'|'max',value:number)=>void; locale:Locale; previewCount?:number };
function LengthStepper({id,label,value,onChange,locale}:{id:string;label:string;value:number;onChange:(value:number)=>void;locale:Locale}) {
  const t=editorCopy[locale];
  const [draft,setDraft]=useState(String(value));
  const [scrub,setScrub]=useState<{left:number;top:number;offset:number;value:number}|null>(null);
  const latest=useRef({value,onChange});latest.current={value,onChange};
  const cleanupRef=useRef<(()=>void)|null>(null),suppressClick=useRef(false);
  useEffect(()=>()=>cleanupRef.current?.(),[]);
  function beginScrub(event:PointerEvent<HTMLButtonElement>){
    if(event.button!==0||event.pointerType==='touch')return;
    cleanupRef.current?.();
    const button=event.currentTarget,id=event.pointerId,rect=button.getBoundingClientRect();
    let active=false,originY=event.clientY,lastY=event.clientY,start=latest.current.value;
    let previousCursor='',previousSelect='';
    button.setPointerCapture(id);
    const left=Math.max(12,Math.min(innerWidth-84,rect.left-76));
    const top=Math.max(12,Math.min(innerHeight-212,event.clientY-100));
    const timer=window.setTimeout(()=>{
      active=true;originY=lastY;start=latest.current.value;
      previousCursor=document.body.style.cursor;previousSelect=document.body.style.userSelect;
      document.body.style.cursor='ns-resize';document.body.style.userSelect='none';
      setScrub({left,top,offset:0,value:start});
    },350);
    const move=(e:globalThis.PointerEvent)=>{
      if(e.pointerId!==id)return;lastY=e.clientY;
      if(!active)return;
      e.preventDefault();
      const next=scrubbedValue(start,e.clientY-originY);
      setDraft(String(next));latest.current.onChange(next);
      setScrub({left,top,offset:Math.max(-48,Math.min(48,e.clientY-originY)),value:next});
    };
    const cleanup=()=>{
      clearTimeout(timer);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);window.removeEventListener('blur',cancel);
      if(button.hasPointerCapture(id))button.releasePointerCapture(id);
      if(active){document.body.style.cursor=previousCursor;document.body.style.userSelect=previousSelect;}
      cleanupRef.current=null;
    };
    const finish=(cancelled:boolean)=>{
      if(active&&cancelled){setDraft(String(start));latest.current.onChange(start);}
      suppressClick.current=active&&!cancelled;
      cleanup();setScrub(null);
      // A long press must not also trigger the short-click increment on release.
      window.setTimeout(()=>{suppressClick.current=false},0);
    };
    const up=(e:globalThis.PointerEvent)=>{if(e.pointerId===id)finish(false)};
    const cancel=()=>finish(true);
    window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancel);window.addEventListener('blur',cancel);
    cleanupRef.current=cleanup;
  }
  useEffect(()=>setDraft(String(value)),[value]);
  function step(delta:number){
    if(suppressClick.current){suppressClick.current=false;return;}
    const next=value+delta;
    if(next>=0&&Number.isSafeInteger(next)){setDraft(String(next));onChange(next);}
  }
  return <><div className="pptx-number-stepper">
    <button type="button" aria-label={`${t.decrease} ${label}`} aria-controls={id} title={t.scrubHint} onPointerDown={beginScrub} disabled={value===0} onClick={()=>step(-1)}>−</button>
    <input id={id} aria-label={label} type="number" inputMode="numeric" min="0" step="1" value={draft} onChange={event=>{
      const raw=event.target.value;setDraft(raw);
      const next=Number(raw);
      if(raw!==''&&Number.isSafeInteger(next)&&next>=0)onChange(next);
    }} onBlur={()=>setDraft(String(value))}/>
    <button type="button" aria-label={`${t.increase} ${label}`} aria-controls={id} title={t.scrubHint} onPointerDown={beginScrub} onClick={()=>step(1)}>+</button>
  </div>{scrub&&createPortal(<div className="pptx-number-scrubber" style={{left:scrub.left,top:scrub.top}} aria-hidden="true">
    <span className="scrubber-label">{label}</span><span className="scrubber-direction">+</span>
    <div className="scrubber-track"><span className="scrubber-center"/><span className="scrubber-thumb" style={{transform:`translate(-50%, calc(-50% + ${scrub.offset}px))`}}/></div>
    <span className="scrubber-direction">−</span><strong>{scrub.value}</strong>
  </div>,document.body)}</>;
}
export default function TextLengthControls({min,max,onChange,locale,previewCount}:Props) {
  const t=editorCopy[locale];
  return <div className="pptx-length-controls">
    {(['min','max'] as const).map(key=><div className="pptx-length-control" key={key}>
      <label htmlFor={`text-${key}`}>{t[key]}</label>
      <LengthStepper id={`text-${key}`} label={t[key]} value={key==='min'?min:max} onChange={value=>onChange(key,value)} locale={locale}/>
    </div>)}
    <p className="coordinate-hint">{previewCount!==undefined&&<span className="pptx-preview-hint-line">{t.previewCount} {previewCount}</span>}<span className="pptx-preview-hint-line">{t.previewExportHint}</span></p>
  </div>;
}
