'use client';
import {useRef,useState} from 'react';
import type {Locale} from '@/lib/i18n';
import { dismissDialogOnBackdrop } from '@/lib/dialog';
import showcaseZh from '@/lib/demo/showcase.json';
import showcaseEn from '@/lib/demo/showcase.en.json';
import {SupportWidget} from './engagement';
import {track} from '@/lib/analytics/browser';
const copy={
 zh:{title:'同一份设计，两种真实结果。',cases:['业务增长复盘','运营提效计划'],features:['文本','动态列表','图片','图表'],original:'原始模板',result:'真实生成',download:'下载完整 PPTX',slides:'10 页',zoom:'放大查看',close:'关闭',},
 en:{title:'One design. Two real outcomes.',cases:['Business growth review','Operational efficiency plan'],features:['Text','Dynamic lists','Images','Charts'],original:'Original template',result:'Generated result',download:'Download full PPTX',slides:'10 slides',zoom:'Enlarge preview',close:'Close',}
};
export default function GeneratedShowcase({locale}:{locale:Locale}){
 const showcase=locale==='en'?showcaseEn:showcaseZh;
 const assetBase=locale==='en'?'/demo/showcase/en':'/demo/showcase';
 const t=copy[locale], [version,setVersion]=useState(0),[feature,setFeature]=useState(0),[enlarged,setEnlarged]=useState<string|null>(null);
 const dialog=useRef<HTMLDialogElement>(null),current=showcase.versions[version],category=showcase.categories[feature];
 const imagePath=(id:string)=>`${assetBase}/${id}-${category.id}.jpg`;
 function enlarge(id:string){track('showcase_preview_opened',{case_id:id,feature:category.id});setEnlarged(id);dialog.current?.showModal();}
 return <section id="results" className="generated-showcase section-shell reveal" aria-labelledby="results-title">
  <div className="showcase-intro"><h2 id="results-title">{t.title}</h2>
  <div className="showcase-case-switch" role="group" aria-label={locale==='zh'?'选择生成案例':'Choose a generated case'}>{showcase.versions.map((v,i)=><button key={v.id} aria-pressed={i===version} onClick={()=>{if(i!==version)track('showcase_case_selected',{case_id:v.id});setVersion(i);}}><span>{String.fromCharCode(65+i)}</span>{t.cases[i]}</button>)}</div></div>
  <div className="showcase-feature-switch" role="group" aria-label={locale==='zh'?'查看变化类型':'Choose a change type'}>{t.features.map((label,i)=><button key={label} aria-pressed={i===feature} onClick={()=>{if(i!==feature)track('showcase_feature_selected',{feature:showcase.categories[i].id,case_id:current.id});setFeature(i);}}>{label}</button>)}</div>
  <div className="showcase-comparison" aria-live="polite">{['original',current.id].map((id,i)=><figure key={id}><figcaption><span>{i===0?t.original:t.result}</span><small>{i===0?'MINIMAL BUSINESS':t.cases[version]}</small></figcaption><button className="showcase-slide" onClick={()=>enlarge(id)} aria-label={`${t.zoom} · ${i===0?t.original:t.cases[version]} · ${t.features[feature]}`}><img key={`${id}-${category.id}`} src={imagePath(id)} alt={`${i===0?t.original:t.cases[version]} · ${t.features[feature]}`} width="1600" height="900" loading="lazy" decoding="async"/><span aria-hidden="true">↗</span></button></figure>)}</div>
  <div className="showcase-detail"><a className="showcase-download" onClick={()=>track('showcase_download_clicked',{case_id:current.id,feature:category.id})} href={`${assetBase}/${current.id}.pptx`} download={`${current.id}${locale==='en'?'-en':''}.pptx`}>{t.download}<span>{t.slides}</span></a></div>
  <SupportWidget locale={locale}/>
  <dialog ref={dialog} className="showcase-lightbox" aria-label={t.zoom} closedby="any" onClick={dismissDialogOnBackdrop}><button className="showcase-close" onClick={()=>dialog.current?.close()}>{t.close} ×</button>{enlarged&&<img src={imagePath(enlarged)} alt={`${enlarged==='original'?t.original:t.cases[version]} · ${t.features[feature]}`} width="1600" height="900"/>}</dialog>
 </section>;
}
