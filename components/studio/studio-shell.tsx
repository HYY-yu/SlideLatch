'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import Link from 'next/link';
import type {Locale} from '@/lib/i18n';
import type {LoadedTemplate,Patches} from '@/lib/pptx/types';
import type {DeckPresentation} from '../pptx/deck-studio';
import SvgSlide from '../pptx/svg-slide';
import styles from './studio-shell.module.css';

type Props={locale:Locale;view:'template'|'deck';onView:(view:'template'|'deck')=>void;model:LoadedTemplate|null;fileName:string;loading:boolean;busy:boolean;error:string;page:number;committedPatches:Patches;textPreviews:Record<string,string>;deck:DeckPresentation;properties:ReactNode;onLocateIssue:(issue:string)=>void;onPage:(page:number)=>void;onOpen:()=>void;onRetry:()=>void;input:ReactNode;canvas:ReactNode;actions:ReactNode;issues:string[];onExport:()=>void;exportBlocked:boolean;exporting:boolean;download:{url:string;name:string;report:string}|null};
type Panel='none'|'export'|'content'|'pages';
const pageName=(type:string,zh:boolean)=>zh?type:({'封面页':'Cover','目录页':'Contents','章节过渡页':'Chapter','内容页':'Content','结尾页':'Closing'}[type]??type);
export default function StudioShell(p:Props){
  const zh=p.locale==='zh',d=p.deck;
  const view=p.view,setView=p.onView;
  const [tab,setTab]=useState<'properties'|'issues'>('properties');
  const [panel,setPanel]=useState<Panel>('none'),[content,setContent]=useState('');
  const [inputError,setInputError]=useState('');
  const draft=view==='deck'&&!!d.source&&!!d.deck.slides.length;
  const pending=p.busy||p.loading||!!d.operation;
  const pages=draft?d.deck.slides:[];
  const currentPage=draft?d.activeSlide:p.page;
  const count=draft?pages.length:p.model?.slides.length??0;
  const importRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(view==='deck'&&(!d.source||!d.deck.slides.length))setView('template')},[view,d.source,d.deck.slides.length,setView]);
  const currentSource=draft?d.source?.preview:p.model;
  const currentSourcePage=draft?(d.selectedPage?.slideNumber??1)-1:p.page;
  const sourceNodes=currentSource?.slides[currentSourcePage]?.nodes??[];
  const issues=draft?(d.check?.issues??[]):p.issues;
  const title=zh?'成稿':'Deck';
  const preview=(index:number)=>{if(!d.source?.preview)return null;const item=d.source.template.slides.find(slide=>slide.templateId===d.deck.slides[index]?.templateId);return item?<SvgSlide model={d.source.preview} slideIndex={item.slideNumber-1} patches={{}} locale={p.locale}/>:null};
  function openPanel(next:Panel){setPanel(value=>value===next?'none':next)}
  return <div id="deck-studio" className={styles.studio} aria-busy={pending}>
    {p.input}
    <header className={styles.header}>
      <Link href={`/${p.locale}`} className={styles.brand} aria-label={zh?'SlideLatch 返回首页':'SlideLatch home'}>Slide<span>Latch</span> <small>Studio</small></Link>
      <div className={styles.identity}><h1>{p.fileName||(zh?'PPT 工作台':'Deck studio')}</h1><span>{draft?(zh?'成稿编辑':'Deck editing'):(zh?'标记验收':'Review marks')} · {p.model?.slides.length??0} {zh?'页源模板':'source slides'}{draft?` / ${count} ${zh?'页成稿':'deck slides'}`:''}</span></div>
      <nav className={styles.headerActions} aria-label={zh?'工作台操作':'Studio actions'}>
        <button disabled={pending} onClick={p.onOpen}>{zh?'打开':'Open'}</button>
        <button className={styles.primary} disabled={!p.model||pending} aria-expanded={panel==='export'} onClick={()=>openPanel('export')}>{zh?'导出':'Export'}</button>
        <Link href={`/${zh?'en':'zh'}/deck-studio`} aria-label={zh?'切换到英文':'Switch to Chinese'}>{zh?'EN':'中文'}</Link>
      </nav>
    </header>
    <div className={styles.documentBar}>
      <div className={styles.viewTabs} aria-label={zh?'文档视图':'Document view'}>
        <button className={!draft?styles.active:''} aria-pressed={!draft} disabled={pending} onClick={()=>setView('template')}>{zh?'模板':'Template'} <small>{p.model?.slides.length??0}</small></button>
        {!!d.deck.slides.length&&<button className={draft?styles.active:''} aria-pressed={draft} disabled={pending} onClick={()=>{setView('deck');setPanel('none')}}>{title} <small>{d.deck.slides.length}</small></button>}
      </div>
      <div className={styles.documentActions}>
        {!draft?<button disabled={!p.model||pending} onClick={()=>{setPanel('none');void d.createFromWorkspace().then(success=>{if(success){setView('deck');setTab('properties')}})}}>{d.deck.slides.length?(zh?'重建成稿':'Rebuild deck'):(zh?'创建成稿':'Create deck')}</button>:<><button disabled={pending} onClick={()=>openPanel('pages')}>{zh?'添加页面 / 替换版式':'Add / replace slide'}</button><button disabled={pending} onClick={()=>openPanel('content')}>{zh?'内容 JSON':'Content JSON'}</button><button disabled={pending} onClick={d.validate}>{zh?'校验内容':'Validate content'}</button></>}
      </div>
    </div>
    {!p.model?<div className={styles.empty} role="status">{p.loading?(zh?'正在打开极简商务…':'Opening Minimal Business…'):<><p>{p.error||(zh?'打开一份 PPTX':'Open a PPTX')}</p><button onClick={p.onRetry}>{zh?'重试公开模板':'Retry public template'}</button></>}</div>:<div className={`${styles.workspace} ${panel!=='none'?styles.withPanel:''}`}>
      <nav className={styles.pages} aria-label={zh?'PPT 页面列表':'Slide list'}><div className={styles.label}>{zh?'页面':'Slides'} <span>{count}</span></div>
        {draft?pages.map((slide,index)=><div className={styles.draftPage} key={`${index}-${slide.templateId}`}><button disabled={pending} className={currentPage===index?styles.selectedPage:''} aria-current={currentPage===index?'page':undefined} aria-label={`${zh?'成稿页':'Deck slide'} ${index+1}`} onClick={()=>d.selectSlide(index)}><span className={styles.number}>{String(index+1).padStart(2,'0')}</span>{preview(index)}</button><div className={styles.pageActions}><button disabled={pending||index===0} onClick={()=>d.moveSlide(index,-1)} aria-label={`${zh?'上移':'Move up'} ${index+1}`}>↑</button><button disabled={pending||index===pages.length-1} onClick={()=>d.moveSlide(index,1)} aria-label={`${zh?'下移':'Move down'} ${index+1}`}>↓</button><button disabled={pending} onClick={()=>d.removeSlide(index)} aria-label={`${zh?'移除':'Remove'} ${index+1}`}>×</button></div></div>):p.model.slides.map((slide,index)=><button disabled={pending} key={slide.path} className={p.page===index?styles.selectedPage:''} aria-label={`${zh?'页':'Slide'} ${index+1}`} aria-current={p.page===index?'page':undefined} onClick={()=>p.onPage(index)}><span className={styles.number}>{String(index+1).padStart(2,'0')}</span><SvgSlide model={p.model!} slideIndex={index} patches={p.committedPatches} locale={p.locale} textPreviews={p.textPreviews}/></button>)}
      </nav>
      <section className={styles.stage} aria-label={zh?'页面画布':'Slide canvas'}>
        <div className={styles.toolbar}><span>{currentPage+1} / {count}{draft&&d.selectedPage?` · ${pageName(d.selectedPage.pageType,zh)}`:''}</span><div className={styles.tools}>{draft?null:p.actions}</div></div>
        <div className={styles.canvas}>{draft&&d.source?.preview&&d.selectedPage?<SvgSlide model={d.source.preview} slideIndex={d.selectedPage.slideNumber-1} patches={{}} locale={p.locale} textPreviews={d.previews} selected={d.selectedKey} interactive onSelect={d.selectObject}/>:p.canvas}</div>
        <div className={styles.canvasStatus}><span>{zh?'SVG 近似预览':'Approximate SVG preview'}</span><span>{Math.round(p.model.deck.size.width)} × {Math.round(p.model.deck.size.height)} pt</span></div>
      </section>
      <aside className={styles.inspector} aria-label={zh?'对象属性':'Object inspector'}>
        <div className={styles.inspectorTabs} role="tablist" aria-label={zh?'对象属性':'Object inspector'}>{(['properties','issues'] as const).map(key=><button key={key} role="tab" aria-selected={tab===key} className={tab===key?styles.active:''} onClick={()=>setTab(key)}>{key==='properties'?(zh?'属性':'Properties'):(zh?'问题':'Issues')}{key==='issues'&&issues.length?` · ${issues.length}`:''}</button>)}</div>
        {tab==='issues'?<div className={styles.issueList}>{issues.length?issues.map((issue,i)=><button key={i} onClick={()=>{if(draft)d.locateIssue(issue);else p.onLocateIssue(issue);setTab('properties')}}>{issue}</button>):<p>{zh?'当前无已报告问题':'No reported issues'}</p>}{draft&&!d.check&&<button onClick={d.validate} disabled={pending}>{zh?'校验内容':'Validate content'}</button>}</div>:draft?<div className={styles.deckInspector}><div className={styles.label}>{zh?'成稿内容':'Deck content'}</div>{d.fields}<details><summary>{zh?'本页对象':'Slide objects'}</summary>{sourceNodes.filter(node=>node.hasTextBody||node.text).map(node=><button className={styles.object} key={node.key} onClick={()=>d.selectObject(node.key)}>{node.text.slice(0,40)||node.name}</button>)}<button onClick={()=>d.selectObject(null)}>{zh?'显示全部字段':'Show all fields'}</button></details></div>:p.properties}
      </aside>
      <aside className={styles.panel} hidden={panel==='none'} aria-label={zh?'文档操作面板':'Document actions'}>
        <div className={styles.panelHeading}><h2>{panel==='export'?(zh?'导出':'Export'):panel==='pages'?(zh?'选择模板页':'Choose source slide'):(zh?'内容 JSON':'Content JSON')}</h2><button aria-label={zh?'关闭面板':'Close panel'} onClick={()=>setPanel('none')}>×</button></div>
        <div hidden={panel!=='export'} className={styles.exportPanel}>
          <h3>{zh?'标记 PPTX':'Marked PPTX'}</h3><button className={styles.primary} disabled={p.exportBlocked||pending} onClick={p.onExport}>{p.exporting?(zh?'正在写回…':'Writing…'):(zh?'生成标记 PPTX':'Generate marked PPTX')}</button>
          {p.download&&<a className={styles.download} download={p.download.name} href={p.download.url}>{zh?'下载标记 PPTX':'Download marked PPTX'} ↓ <small>{p.download.report}</small></a>}
          <h3>{zh?'编译草稿包':'Compiled draft package'}</h3><button disabled={pending} onClick={d.exportTemplate}>{zh?'编译并打包':'Compile and package'}</button>{d.bundle&&<a className={styles.download} href={d.bundle.url} download={d.bundle.name}>{zh?'下载草稿 ZIP':'Download draft ZIP'} ↓</a>}
          {!!d.deck.slides.length&&<><h3>{zh?'成稿 PPTX':'Generated PPTX'}</h3><label>{zh?'成稿名称':'Deck name'}<input value={d.deck.title??''} disabled={pending} onChange={event=>d.title(event.target.value)}/></label><button disabled={pending} onClick={d.validate}>{zh?'校验内容':'Validate content'}</button><button className={styles.primary} disabled={pending||!d.valid} onClick={d.generate}>{zh?'生成成稿 PPTX':'Generate deck PPTX'}</button>{d.download&&<a className={styles.download} href={d.download.url} download={d.download.name}>{zh?'下载成稿 PPTX':'Download generated PPTX'} ↓ <small>{d.download.slideCount} {zh?'页':'slides'} · {Math.round(d.download.bytes/1024)} KB</small></a>}</>}
          <details><summary>{zh?'支持范围与检查':'Support and checks'}</summary><p>{zh?'标记稿保留原始对象。浏览器成稿支持纯文本、自动序号和原项数列表。编译包是草稿，正式发布仍需边界审查与发布门禁。':'Marked files retain original objects. Browser generation supports plain text, numbering and original list counts. Compiled packages are drafts; release gates still apply.'}</p><p>{zh?'成稿仍需封面、目录、3–6 个章节和结尾。SVG 与包结构检查不能代替 PowerPoint 目视验收。':'Generated decks still require a cover, contents, 3–6 chapters and closing. SVG and package checks do not replace native PowerPoint review.'}</p></details>
        </div>
        <div hidden={panel!=='pages'} className={styles.contentPanel}>
          <label htmlFor="studio-page-type">{zh?'页面类型':'Page type'}</label><select id="studio-page-type" value={d.pageFilter} disabled={pending} onChange={event=>d.filterPages(event.target.value)}><option value="">{zh?'全部类型':'All types'}</option>{['封面页','目录页','章节过渡页','内容页','结尾页'].map(type=><option key={type} value={type}>{pageName(type,zh)}</option>)}</select>
          <label htmlFor="studio-source-page">{zh?'源模板页':'Source slide'}</label><select id="studio-source-page" value={d.candidateId} disabled={pending} onChange={event=>d.selectCandidate(event.target.value)}>{d.candidates?.map(slide=><option key={slide.templateId} value={slide.templateId}>{slide.slideNumber} · {pageName(slide.pageType,zh)}</option>)}</select>
          {d.source?.preview&&d.source.template.slides.find(slide=>slide.templateId===d.candidateId)&&<div className={styles.candidatePreview}><SvgSlide model={d.source.preview} slideIndex={d.source.template.slides.find(slide=>slide.templateId===d.candidateId)!.slideNumber-1} patches={{}} locale={p.locale}/></div>}
          <button className={styles.primary} disabled={pending||!d.candidates?.some(slide=>slide.templateId===d.candidateId)||d.deck.slides.length>=200} onClick={()=>{d.addPage();setView('deck');setPanel('none')}}>{zh?'加入成稿':'Add to deck'}</button>
          <button disabled={pending||!d.candidates?.some(slide=>slide.templateId===d.candidateId)||!d.deck.slides.length} onClick={()=>{d.replacePage();setView('deck');setPanel('none')}}>{zh?'替换当前页':'Replace current slide'}</button><p className={styles.hint}>{zh?'替换会重置当前页内容。':'Replacement resets the current slide content.'}</p>
        </div>
        <div hidden={panel!=='content'} className={styles.contentPanel}><button onClick={d.exportContent}>{zh?'导出当前内容':'Export current content'}</button><button onClick={()=>importRef.current?.click()}>{zh?'选择内容 JSON':'Choose content JSON'}</button><input ref={importRef} type="file" accept=".json,application/json" hidden onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file){if(file.size>8*1024*1024){setInputError(zh?'内容 JSON 超过 8 MB，原输入已保留。':'Content JSON exceeds 8 MB. Your input is preserved.');console.warn('[SlideLatch] studio.content.size_rejected',{bytes:file.size});return;}void file.text().then(text=>{setContent(text);setInputError('')}).catch(cause=>{console.error('[SlideLatch] studio.content.read.failed',cause);setInputError(zh?'无法读取内容 JSON，原输入已保留。':'Could not read content JSON. Your input is preserved.')})}}}/><label htmlFor="studio-content-input">{zh?'成稿内容 JSON':'Deck content JSON'}</label><textarea id="studio-content-input" value={content} rows={12} onChange={event=>setContent(event.target.value)}/><button disabled={pending||!content.trim()} onClick={()=>d.importContent(content)}>{zh?'应用内容':'Apply content'}</button></div>
      </aside>
    </div>}
    <footer className={styles.status} role="status"><span className={styles.dot}/><span>{p.error||d.error||inputError||(draft&&d.valid?(zh?'内容校验通过':'Content validation passed'):'')||d.notice||(zh?'文件在本地':'Local files')}</span><span className={styles.native}>{zh?'PowerPoint 未检查':'PowerPoint unchecked'}</span>{d.operation&&<button onClick={d.cancel}>{zh?'取消操作':'Cancel'}</button>}</footer>
  </div>;
}
