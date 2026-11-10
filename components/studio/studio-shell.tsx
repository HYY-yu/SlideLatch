'use client';
import {useState,type ReactNode} from 'react';
import Link from 'next/link';
import type {Locale} from '@/lib/i18n';
import type {LoadedTemplate,Patches} from '@/lib/pptx/types';
import SvgSlide from '../pptx/svg-slide';
import styles from './studio-shell.module.css';

type Props={locale:Locale;model:LoadedTemplate|null;fileName:string;loading:boolean;busy:boolean;error:string;page:number;committedPatches:Patches;textPreviews:Record<string,string>;properties:ReactNode;onLocateIssue:(issue:string)=>void;onPage:(page:number)=>void;onOpen:()=>void;onRetry:()=>void;input:ReactNode;canvas:ReactNode;actions:ReactNode;issues:string[];onExport:()=>void;exportBlocked:boolean;exporting:boolean;download:{url:string;name:string;report:string}|null};

export default function StudioShell(p:Props){
  const zh=p.locale==='zh';
  const [tab,setTab]=useState<'properties'|'issues'>('properties');
  const [exportOpen,setExportOpen]=useState(false);
  const pending=p.busy||p.loading;
  const count=p.model?.slides.length??0;
  return <div id="deck-studio" className={styles.studio} aria-busy={pending}>
    {p.input}
    <header className={styles.header}>
      <Link href={`/${p.locale}`} className={styles.brand} aria-label={zh?'SlideLatch 返回首页':'SlideLatch home'}>Slide<span>Latch</span> <small>Studio</small></Link>
      <div className={styles.identity}><h1>{p.fileName||(zh?'PPT 工作台':'Deck studio')}</h1><span>{zh?'标记验收':'Review marks'} · {count} {zh?'页源模板':'source slides'}</span></div>
      <nav className={styles.headerActions} aria-label={zh?'工作台操作':'Studio actions'}>
        <button disabled={pending} onClick={p.onOpen}>{zh?'打开':'Open'}</button>
        <button className={styles.primary} disabled={!p.model||pending} aria-expanded={exportOpen} onClick={()=>setExportOpen(value=>!value)}>{zh?'导出':'Export'}</button>
        <Link href={`/${zh?'en':'zh'}/deck-studio`} aria-label={zh?'切换到英文':'Switch to Chinese'}>{zh?'EN':'中文'}</Link>
      </nav>
    </header>
    {!p.model?<div className={styles.empty} role="status">{p.loading?(zh?'正在打开极简商务…':'Opening Minimal Business…'):<><p>{p.error||(zh?'打开一份 PPTX':'Open a PPTX')}</p><button onClick={p.onRetry}>{zh?'重试公开模板':'Retry public template'}</button></>}</div>:<div className={`${styles.workspace} ${exportOpen?styles.withPanel:''}`}>
      <nav className={styles.pages} aria-label={zh?'PPT 页面列表':'Slide list'}><div className={styles.label}>{zh?'页面':'Slides'} <span>{count}</span></div>
        {p.model.slides.map((slide,index)=><button disabled={pending} key={slide.path} className={p.page===index?styles.selectedPage:''} aria-label={`${zh?'页':'Slide'} ${index+1}`} aria-current={p.page===index?'page':undefined} onClick={()=>p.onPage(index)}><span className={styles.number}>{String(index+1).padStart(2,'0')}</span><SvgSlide model={p.model!} slideIndex={index} patches={p.committedPatches} locale={p.locale} textPreviews={p.textPreviews}/></button>)}
      </nav>
      <section className={styles.stage} aria-label={zh?'页面画布':'Slide canvas'}>
        <div className={styles.toolbar}><span>{p.page+1} / {count}</span><div className={styles.tools}>{p.actions}</div></div>
        <div className={styles.canvas}>{p.canvas}</div>
        <div className={styles.canvasStatus}><span>{zh?'SVG 近似预览':'Approximate SVG preview'}</span><span>{Math.round(p.model.deck.size.width)} × {Math.round(p.model.deck.size.height)} pt</span></div>
      </section>
      <aside className={styles.inspector} aria-label={zh?'对象属性':'Object inspector'}>
        <div className={styles.inspectorTabs} role="tablist" aria-label={zh?'对象属性':'Object inspector'}>{(['properties','issues'] as const).map(key=><button key={key} role="tab" aria-selected={tab===key} className={tab===key?styles.active:''} onClick={()=>setTab(key)}>{key==='properties'?(zh?'属性':'Properties'):(zh?'问题':'Issues')}{key==='issues'&&p.issues.length?` · ${p.issues.length}`:''}</button>)}</div>
        {tab==='issues'?<div className={styles.issueList}>{p.issues.length?p.issues.map((issue,i)=><button key={i} onClick={()=>{p.onLocateIssue(issue);setTab('properties')}}>{issue}</button>):<p>{zh?'当前无已报告问题':'No reported issues'}</p>}</div>:p.properties}
      </aside>
      <aside className={styles.panel} hidden={!exportOpen} aria-label={zh?'文档操作面板':'Document actions'}>
        <div className={styles.panelHeading}><h2>{zh?'导出':'Export'}</h2><button aria-label={zh?'关闭面板':'Close panel'} onClick={()=>setExportOpen(false)}>×</button></div>
        <div className={styles.exportPanel}>
          <h3>{zh?'标记 PPTX':'Marked PPTX'}</h3><button className={styles.primary} disabled={p.exportBlocked||pending} onClick={p.onExport}>{p.exporting?(zh?'正在写回…':'Writing…'):(zh?'生成标记 PPTX':'Generate marked PPTX')}</button>
          {p.download&&<a className={styles.download} download={p.download.name} href={p.download.url}>{zh?'下载标记 PPTX':'Download marked PPTX'} ↓ <small>{p.download.report}</small></a>}
        </div>
      </aside>
    </div>}
    <footer className={styles.status} role="status"><span className={styles.dot}/><span>{p.error||(zh?'文件在本地':'Local files')}</span><span className={styles.native}>{zh?'PowerPoint 未检查':'PowerPoint unchecked'}</span></footer>
  </div>;
}
