'use client';
import {useEffect} from 'react';
import {startAnalytics,trackOnce} from '@/lib/analytics/browser';
import type {Locale} from '@/lib/i18n';
export default function Analytics({locale}:{locale:Locale}){
 useEffect(()=>{
  void startAnalytics();trackOnce(`landing:${locale}`,'landing_viewed',{locale});
  const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){const id=entry.target.id;trackOnce(`${id}:${locale}`,id==='results'?'showcase_viewed':'workbench_viewed',{locale});observer.unobserve(entry.target);}},{threshold:.25});
  for(const id of ['results','demo']){const el=document.getElementById(id);if(el)observer.observe(el);}
  return ()=>observer.disconnect();
 },[locale]);
 return null;
}
