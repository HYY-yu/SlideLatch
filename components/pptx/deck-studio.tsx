'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import type { Locale } from '@/lib/i18n';
import type { LoadedTemplate, Patches } from '@/lib/pptx/types';
import { writePptx } from '@/lib/pptx/xml';
import { loadTemplate } from '@/lib/pptx/load';
import { validateReleaseReview } from '@/lib/workflow/release';
import { assertReviewMatchesManifest } from '@/packages/ppt-dsl/src/review-contract';
import { meaningfulTextLength } from '@/packages/ppt-dsl/src/text-length';
import { loadBrowserTemplate, createBrowserSlideInput, createBrowserDeckInput, validateBrowserDeck, generateBrowserDeck } from '@/lib/workflow/browser-deck';
import type { BrowserTemplate, ComponentManifest, DeckInput, DeckInputSlide } from '@/lib/workflow/browser-deck';
import templateZh from '@/lib/demo/template.json';
import templateEn from '@/lib/demo/template.en.json';
import SvgSlide from './svg-slide';
import styles from './deck-studio.module.css';

type Props = { locale: Locale; model: LoadedTemplate | null; patches: Patches; busy: boolean; fileName: string };
type Source = { template: BrowserTemplate; bytes: Uint8Array; name: string; origin: 'workspace' | 'demo' | 'import'; review?: unknown; preview: LoadedTemplate | null };
type Check = { revision: number; issues: string[] };
type Download = { url: string; name: string; bytes: number; slideCount: number };
type FieldChange = { slideIndex: number; key: string; value: string; listKey?: string; itemIndex?: number };
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const copyBytes = (bytes: Uint8Array) => new Uint8Array(bytes).buffer;
const pageLabel = (pageType: string, zh: boolean) => zh ? pageType : ({'封面页':'Cover','目录页':'Contents','章节过渡页':'Chapter','内容页':'Content','结尾页':'Closing'}[pageType] || pageType);
const message = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);

/** Strictly local inputs; no asset URL fields or remote generation requests. */
export default function DeckStudio(props: Props) {
  const { locale, model, patches, busy: editorBusy, fileName } = props, zh = locale === 'zh';
  const [ready, setReady] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [deck, setDeck] = useState<DeckInput>({ title: 'SlideLatch', slides: [] });
  const [activeSlide, setActiveSlide] = useState(0), [candidateId, setCandidateId] = useState(''), [pageFilter, setPageFilter] = useState('');
  const [operation, setOperation] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [check, setCheck] = useState<Check | null>(null), [download, setDownload] = useState<Download | null>(null), [bundle, setBundle] = useState<Download | null>(null);
  const fileRef = useRef<HTMLInputElement>(null), mounted = useRef(false), revision = useRef(0);
  const sourceRef = useRef(source), deckRef = useRef(deck), checkRef = useRef(check), operationRef = useRef<{ id: number; kind: string; controller: AbortController; model: Props['model']; patches: Patches } | null>(null);
  const nextOperation = useRef(0), urls = useRef(new Set<string>()), live = useRef(props);
  live.current = props;
  useEffect(() => { mounted.current = true; setReady(true); return () => { mounted.current = false; operationRef.current?.controller.abort(); operationRef.current = null; for (const url of urls.current) URL.revokeObjectURL(url); }; }, []);
  function revoke(url?: string) { if (url) { URL.revokeObjectURL(url); urls.current.delete(url); } }
  function clearResults() {
    revision.current++; checkRef.current = null; setCheck(null); setDownload(previous => { revoke(previous?.url); return null; });
    setError(''); setNotice('');
  }
  function setInput(value: DeckInput) { clearResults(); deckRef.current = value; setDeck(value); }
  function assertIdle() { if (!mounted.current || operationRef.current) throw new Error(zh ? '请等待当前操作完成，或先取消。' : 'Wait for the current operation or cancel it first.'); }
  function start(kind: string) {
    assertIdle(); const task = { id: ++nextOperation.current, kind, controller: new AbortController(), model: live.current.model, patches: live.current.patches };
    operationRef.current = task; setOperation(kind); setError(''); setNotice(''); return task;
  }
  function current(task: NonNullable<typeof operationRef.current>, version: number) { return mounted.current && operationRef.current === task && !task.controller.signal.aborted && revision.current === version && (task.kind !== 'workspace' || (live.current.model === task.model && live.current.patches === task.patches)); }
  function finish(task: NonNullable<typeof operationRef.current>) { if (operationRef.current === task) { operationRef.current = null; if (mounted.current) setOperation(''); } }
  function cancel() { operationRef.current?.controller.abort(); operationRef.current = null; clearResults(); setOperation(''); setNotice(zh ? '已取消。未完成的结果不会替换当前内容。' : 'Canceled. Unfinished results will not replace your content.'); }
  async function run(action: () => unknown | Promise<unknown>) { try { await action(); } catch (cause) { if (mounted.current) setError(message(cause)); } }
  // A draft compiled from the authoring workspace cannot survive a later source edit.
  useEffect(() => {
    if (sourceRef.current?.origin !== 'workspace' && operationRef.current?.kind !== 'workspace') return;
    operationRef.current?.controller.abort(); operationRef.current = null; setOperation('');
    clearResults(); sourceRef.current = null; setSource(null); deckRef.current = { title: 'SlideLatch', slides: [] }; setDeck(deckRef.current);
    setBundle(previous => { revoke(previous?.url); return null; });
    setNotice(zh ? '作者工作区已变化，请重新编译当前草稿。' : 'The authoring workspace changed. Compile the current draft again.');
    // Only committed edits invalidate the pinned template. Uncommitted edits block compilation below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, patches]);

  async function install(bytes: Uint8Array, name: string, origin: Source['origin'], task: NonNullable<typeof operationRef.current>, version: number, options: { manifest?: unknown; lock?: unknown; review?: unknown } = {}) {
    const template = await loadBrowserTemplate(bytes, { manifest: options.manifest, lock: options.lock });
    if (!current(task, version)) return;
    const review = options.review === undefined ? undefined : await validateReleaseReview(bytes, options.review);
    if (review) assertReviewMatchesManifest(template.manifest, review.probes);
    if (!current(task, version)) return;
    let preview: LoadedTemplate | null = null;
    try { preview = await loadTemplate(copyBytes(bytes)); } catch { /* Preview support is independent of the OOXML generation gate. */ }
    if (!current(task, version)) return;
    const next: Source = { template, bytes: new Uint8Array(bytes), name, origin, review, preview };
    clearResults(); sourceRef.current = next; setSource(next); deckRef.current = { title: name.replace(/\.(pptx|zip)$/i, ''), slides: [] }; setDeck(deckRef.current);
    setActiveSlide(0); setPageFilter(''); setCandidateId(template.slides[0]?.templateId ?? '');
    setBundle(previous => { revoke(previous?.url); return null; });
    setNotice(zh ? '模板已编译。选择页面加入成稿，然后填写内容。' : 'Template compiled. Add pages to your deck, then fill the fields.');
    return { templateSha256: template.sourceSha256, slideCount: template.slides.length };
  }
  async function compileWorkspace() {
    if (!live.current.model || live.current.busy) throw new Error(zh ? '请先打开 PPTX 并完成当前编辑。' : 'Open a PPTX and finish the current edit first.');
    const task = start('workspace'), version = revision.current, captured = live.current;
    try { const bytes = await writePptx(captured.model!.bytes, captured.patches); if (!current(task, version)) return; return await install(new Uint8Array(bytes), captured.fileName || 'workspace.pptx', 'workspace', task, version); }
    catch (cause) { if (current(task, version)) throw cause; }
    finally { finish(task); }
  }
  async function loadDemo() {
    const task = start('load'), version = revision.current, demo = live.current.locale === 'en' ? templateEn : templateZh;
    try {
      const response = await fetch(demo.downloadUrl, { signal: task.controller.signal });
      if (!response.ok) throw new Error(`TEMPLATE_HTTP_${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const digest = await crypto.subtle.digest('SHA-256', copyBytes(bytes));
      if (Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('') !== demo.sha256) throw new Error('TEMPLATE_HASH_MISMATCH');
      if (!current(task, version)) return;
      return await install(bytes, demo.downloadUrl.split('/').pop() || 'demo.pptx', 'demo', task, version);
    } catch (cause) { if (current(task, version)) throw cause; } finally { finish(task); }
  }
  async function importFiles(files: File[]) {
    const task = start('load'), version = revision.current;
    try {
      if (!files.length || files.length > 8 || files.some(file => !file.size || file.size > MAX_FILE_BYTES)) throw new Error(zh ? '最多选择 8 个文件，每个文件不超过 50 MB。' : 'Choose up to 8 files, each no larger than 50 MB.');
      let parts: Array<{ name: string; bytes: Uint8Array }>;
      if (files.length === 1 && /\.zip$/i.test(files[0].name)) {
        const zip = await JSZip.loadAsync(await files[0].arrayBuffer());
        const entries = Object.values(zip.files).filter(entry => !entry.dir);
        let expanded = 0;
        if (entries.length > 20) throw new Error('TEMPLATE_BUNDLE_ENTRY_LIMIT');
        for (const entry of entries) { const size = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0; if (!Number.isSafeInteger(size) || size < 0 || size > MAX_FILE_BYTES) throw new Error('TEMPLATE_BUNDLE_ENTRY_LIMIT'); expanded += size; }
        if (expanded > 70 * 1024 * 1024) throw new Error('TEMPLATE_BUNDLE_EXPANSION_LIMIT');
        const relevant = entries.filter(entry => /(?:^|\/)(?:template\.pptx|template-manifest\.json|template\.lock\.json|workflow-review\.json)$/.test(entry.name));
        parts = await Promise.all(relevant.map(async entry => ({ name: entry.name.split('/').pop()!, bytes: await entry.async('uint8array') })));
      } else parts = await Promise.all(files.map(async file => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })));
      if (new Set(parts.map(part => part.name)).size !== parts.length) throw new Error('TEMPLATE_BUNDLE_DUPLICATE_FILES');
      const pptx = parts.filter(part => /\.pptx$/i.test(part.name));
      if (pptx.length !== 1) throw new Error(zh ? '请选择一个 PPTX。ZIP 内需要 template.pptx。' : 'Choose one PPTX. A ZIP must contain template.pptx.');
      const readJson = (name: string) => { const part = parts.find(item => item.name === name); if (!part) return undefined; if (part.bytes.byteLength > 8 * 1024 * 1024) throw new Error('TEMPLATE_JSON_SIZE_LIMIT'); return JSON.parse(new TextDecoder().decode(part.bytes)) as unknown; };
      const manifest = readJson('template-manifest.json'), lock = readJson('template.lock.json'), review = readJson('workflow-review.json');
      if ((lock !== undefined || files.some(file => /\.zip$/i.test(file.name))) && manifest === undefined) throw new Error(zh ? '编译包缺少 template-manifest.json。' : 'The compiled bundle is missing template-manifest.json.');
      const unsupported = parts.filter(part => /\.json$/i.test(part.name) && !['template-manifest.json','template.lock.json','workflow-review.json','input.schema.json','deck-content.schema.json','template-lint.json','workflow-release.json','browser-template-status.json'].includes(part.name));
      if (unsupported.length) throw new Error(zh ? '无法识别 JSON 文件名，请保留编译器输出的文件名。' : 'Unrecognized JSON filename. Keep the compiler output filenames.');
      if (!current(task, version)) return;
      return await install(pptx[0].bytes, pptx[0].name, 'import', task, version, { manifest, lock, review });
    } catch (cause) { if (current(task, version)) throw cause; } finally { finish(task); }
  }
  function addSlide(templateId: string) {
    assertIdle(); const loaded = sourceRef.current; if (!loaded) throw new Error('TEMPLATE_NOT_LOADED');
    if (deckRef.current.slides.length >= 200) throw new Error('DECK_SLIDE_LIMIT');
    const slide = createBrowserSlideInput(loaded.template, templateId), index = deckRef.current.slides.length;
    setInput({ ...deckRef.current, slides: [...deckRef.current.slides, slide] }); setActiveSlide(index); return { slideIndex: index };
  }
  function useStarter() {
    assertIdle(); if (!sourceRef.current) throw new Error('TEMPLATE_NOT_LOADED');
    const starter = createBrowserDeckInput(sourceRef.current.template);
    if (!starter.slides.length) throw new Error(zh ? '当前模板缺少可组成完整成稿的封面、3–6 项目录、章节、内容或结尾页。请补全页面契约；现有成稿已保留。' : 'This template needs a cover, 3–6-item contents, chapter, content and closing pages to build a starter. Complete the page contracts; your current deck is preserved.');
    setInput({ ...starter, title: deckRef.current.title }); setActiveSlide(0);
  }
  function replaceSlide(templateId: string, index: number) {
    assertIdle(); const loaded = sourceRef.current;
    if (!loaded || !Number.isInteger(index) || !deckRef.current.slides[index]) throw new Error('INVALID_SLIDE_INDEX');
    const slide = createBrowserSlideInput(loaded.template, templateId);
    setInput({ ...deckRef.current, slides: deckRef.current.slides.map((item, i) => i === index ? slide : item) }); setActiveSlide(index);
  }
  function removeSlide(index: number) {
    assertIdle(); if (!Number.isInteger(index) || index < 0 || index >= deckRef.current.slides.length) throw new Error('INVALID_SLIDE_INDEX');
    const slides = deckRef.current.slides.filter((_, i) => i !== index); setInput({ ...deckRef.current, slides }); setActiveSlide(previous => Math.max(0, Math.min(previous >= index ? previous - 1 : previous, slides.length - 1)));
  }
  function moveSlide(index: number, direction: -1 | 1) {
    assertIdle(); const slides = [...deckRef.current.slides], target = index + direction;
    if (!slides[index] || target < 0 || target >= slides.length) return;
    [slides[index], slides[target]] = [slides[target], slides[index]]; setInput({ ...deckRef.current, slides }); setActiveSlide(target);
  }
  function setField(change: FieldChange) {
    assertIdle(); const loaded = sourceRef.current, input = deckRef.current.slides[change.slideIndex];
    if (!loaded || !input || typeof change.value !== 'string' || change.value.length > 20000) throw new Error('INVALID_FIELD_CHANGE');
    const slide = loaded.template.slides.find(item => item.templateId === input.templateId)!;
    const component = change.listKey === undefined ? slide.nodes.find(node => node.key === change.key) : slide.lists.find(list => list.key === change.listKey)?.items[change.itemIndex ?? -1]?.components.find(node => node.key === change.key);
    if (!component || component.kind !== 'text') throw new Error('FIELD_NOT_EDITABLE');
    let next: DeckInputSlide;
    if (change.listKey !== undefined) {
      const items = input.lists?.[change.listKey]; if (!items || change.itemIndex === undefined || !items[change.itemIndex]) throw new Error('INVALID_LIST_ITEM');
      next = { ...input, lists: { ...input.lists, [change.listKey]: items.map((item, index) => index === change.itemIndex ? { ...item, [change.key]: change.value } : item) } };
    } else next = { ...input, nodes: { ...input.nodes, [change.key]: change.value } };
    setInput({ ...deckRef.current, slides: deckRef.current.slides.map((item, index) => index === change.slideIndex ? next : item) });
  }
  async function validate() {
    const loaded = sourceRef.current; if (!loaded) throw new Error('TEMPLATE_NOT_LOADED');
    const task = start('validate'), version = revision.current;
    try { const issues = await validateBrowserDeck(loaded.template, deckRef.current); if (!current(task, version)) return; const result = { revision: version, issues }; checkRef.current = result; setCheck(result); return { valid: !issues.length, issues }; }
    catch (cause) { if (current(task, version)) throw cause; }
    finally { finish(task); }
  }
  async function generate() {
    const loaded = sourceRef.current, approved = checkRef.current;
    if (!loaded || !approved || approved.revision !== revision.current || approved.issues.length) throw new Error(zh ? '请先校验当前内容，并修复所有问题。' : 'Validate the current content and resolve every issue first.');
    const task = start('generate'), version = revision.current;
    try {
      const result = await generateBrowserDeck(loaded.template, deckRef.current);
      if (!current(task, version)) return;
      const url = URL.createObjectURL(new Blob([copyBytes(result.bytes)], { type: PPTX_MIME })); urls.current.add(url);
      const filename = (deckRef.current.title || 'slidelatch-deck').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 100);
      const artifact = { url, name: `${filename}-generated.pptx`, bytes: result.bytes.byteLength, slideCount: result.report.slideCount };
      setDownload(previous => { revoke(previous?.url); return artifact; });
      return { bytes: result.bytes.byteLength, report: result.report };
    } catch (cause) { if (current(task, version)) throw cause; } finally { finish(task); }
  }
  async function exportTemplate() {
    const loaded = sourceRef.current; if (!loaded) throw new Error('TEMPLATE_NOT_LOADED');
    const task = start('bundle'), version = revision.current;
    try {
      const zip = new JSZip(); zip.file('template.pptx', loaded.bytes); zip.file('template-manifest.json', JSON.stringify(loaded.template.manifest, null, 2));
      zip.file('template.lock.json', JSON.stringify({ manifestVersion: loaded.template.manifest.manifestVersion, templateSha256: loaded.template.sourceSha256 }, null, 2));
      if (loaded.review !== undefined) zip.file('workflow-review.json', JSON.stringify(loaded.review, null, 2));
      zip.file('browser-template-status.json', JSON.stringify({ schemaVersion: 1, status: loaded.review ? 'svg_review_checked' : 'draft', visualGuarantee: false, nativeOfficeValidation: 'not_run', limitations: loaded.template.limitations }, null, 2));
      const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
      if (!current(task, version)) return;
      const url = URL.createObjectURL(new Blob([copyBytes(bytes)], { type: 'application/zip' })); urls.current.add(url);
      setBundle(previous => { revoke(previous?.url); return { url, name: 'slidelatch-template-draft.zip', bytes: bytes.byteLength, slideCount: loaded.template.slides.length }; });
      return { bytes: bytes.byteLength, status: loaded.review ? 'svg_review_checked' : 'draft' };
    } catch (cause) { if (current(task, version)) throw cause; } finally { finish(task); }
  }
  // Small automation surface operates on the same UI state and gates, never a separate bypass.
  useEffect(() => {
    const api = { version: 1, inspect: () => ({ templateSha256: sourceRef.current?.template.sourceSha256 ?? null, source: sourceRef.current?.origin ?? null, reviewed: !!sourceRef.current?.review, pages: sourceRef.current?.template.slides.map(slide => ({ templateId: slide.templateId, pageType: slide.pageType, nodes: slide.nodes, lists: slide.lists })) ?? [], input: structuredClone(deckRef.current), busy: operationRef.current?.kind ?? null, validation: checkRef.current, revision: revision.current }), loadDemo, compileWorkspace, addSlide, removeSlide, setField, useStarter, replaceSlide, validate, generate, cancel };
    const target = window as typeof window & { slidelatchDeckStudio?: typeof api }; target.slidelatchDeckStudio = api;
    return () => { if (target.slidelatchDeckStudio === api) delete target.slidelatchDeckStudio; };
  });

  const selectedInput = deck.slides[activeSlide], selectedPage = source?.template.slides.find(slide => slide.templateId === selectedInput?.templateId);
  const candidates = source?.template.slides.filter(slide => !pageFilter || slide.pageType === pageFilter) ?? [];
  const candidate = source?.template.slides.find(slide => slide.templateId === candidateId);
  const previews = useMemo(() => {
    const values: Record<string, string> = {}; if (!selectedPage || !selectedInput) return values;
    for (const node of selectedPage.nodes) { const value = selectedInput.nodes?.[node.key]; if (typeof value === 'string') values[`${selectedPage.slidePath}#${node.locator.shapeId}`] = value; }
    for (const list of selectedPage.lists) for (const [index, item] of list.items.entries()) for (const node of item.components) { const value = selectedInput.lists?.[list.key]?.[index]?.[node.key]; if (typeof value === 'string') values[`${selectedPage.slidePath}#${node.locator.shapeId}`] = value; }
    return values;
  }, [selectedPage, selectedInput]);
  const valid = !!check && check.revision === revision.current && !check.issues.length;
  function field(node: ComponentManifest, value: unknown, listKey?: string, itemIndex?: number) {
    if (node.kind !== 'text') return <p key={node.key} className={styles.retained}>{node.key} · {node.kind === 'number' ? (zh ? '由页序自动编号' : 'Numbered from deck order') : (zh ? '保留模板原对象' : 'Original template object retained')}</p>;
    const id = `deck-field-${activeSlide}-${listKey ?? 'page'}-${itemIndex ?? 0}-${node.key}`, text = typeof value === 'string' ? value : '', measured = meaningfulTextLength(text), count = measured.length;
    const invalid = measured.hasInvalidCharacters || !!node.length && (count < node.length.min || count > node.length.max);
    return <div className={styles.field} key={node.key}><label htmlFor={id}><span>{node.key}</span><span className={invalid ? styles.invalid : ''}>{count}{node.length ? ` / ${node.length.min}–${node.length.max}` : ''} {zh ? '字符' : 'characters'}</span></label><textarea id={id} rows={node.length && node.length.max <= 40 ? 2 : 3} value={text} disabled={!!operation} maxLength={20000} aria-invalid={!!invalid} onChange={event => void run(() => setField({ slideIndex: activeSlide, key: node.key, value: event.target.value, listKey, itemIndex }))}/></div>;
  }

  return <section id="deck-studio" className={styles.studio} aria-labelledby="deck-studio-title" aria-busy={!!operation}>
    <header className={styles.heading}><div><p className={styles.eyebrow}>02 / {zh ? '模板 → 成稿' : 'TEMPLATE → DECK'}</p><h2 id="deck-studio-title">{zh ? '选择模板，填充成稿' : 'Build a deck from your template'}</h2></div><span className={styles.status}>{source?.review ? (zh ? 'SVG 边界审查已核对' : 'SVG boundary review checked') : (zh ? '草稿 · 未经过发布审查' : 'Draft · not release-reviewed')}</span></header>
    <p className={styles.description}>{zh ? '忠于原 PPT，快速填充复用。使用上方编辑结果或已编译模板，文件与内容只在此浏览器处理。' : 'Reuse the original PPT design with new content. Use your edits above or a compiled template; files and content stay in this browser.'}</p>
    <div className={styles.sources}>
      <button className="button button-primary" disabled={!ready || !!operation || !model || editorBusy} onClick={() => void run(compileWorkspace)}>{zh ? '编译当前工作区草稿' : 'Compile current workspace draft'}</button>
      <button className="button button-secondary" disabled={!ready || !!operation} onClick={() => fileRef.current?.click()}>{zh ? '导入 PPTX / 编译包' : 'Import PPTX / compiled bundle'}</button>
      <button className={styles.textButton} disabled={!ready || !!operation} onClick={() => void run(loadDemo)}>{zh ? '试用公开示例' : 'Try public demo'}</button>
      <input ref={fileRef} type="file" multiple accept=".pptx,.json,.zip" hidden aria-label={zh ? '选择模板文件或编译 ZIP' : 'Choose template files or compiled ZIP'} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; if (files.length) void run(() => importFiles(files)); }}/>
    </div>
    <p className={styles.hint}>{zh ? '支持单个 PPTX、编译 ZIP，或同时选择 template.pptx + template-manifest.json + template.lock.json（可附 workflow-review.json）。草稿编译不代表发布审查通过。' : 'Open a PPTX, a compiled ZIP, or select template.pptx + template-manifest.json + template.lock.json together (optionally workflow-review.json). Draft compilation is not release approval.'}</p>
    {operation && <div className={styles.operation} role="status"><span>{zh ? '正在处理…' : 'Working…'}</span><button className={styles.textButton} onClick={cancel}>{zh ? '取消' : 'Cancel'}</button></div>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {source && <>
      <div className={styles.identity}><strong>{source.name}</strong><span>{source.template.slides.length} {zh ? '个模板页面' : 'template pages'} · SHA-256 {source.template.sourceSha256.slice(0, 12)}</span><button className={styles.textButton} disabled={!!operation} onClick={() => void run(exportTemplate)}>{zh ? '导出编译草稿包' : 'Export compiled draft bundle'}</button>{bundle && <a href={bundle.url} download={bundle.name}>{zh ? '下载模板 ZIP ↓' : 'Download template ZIP ↓'}</a>}</div>
      <div className={styles.layout}>
        <aside className={styles.pages} aria-label={zh ? '模板与页面顺序' : 'Template and deck pages'}>
          <h3>{zh ? '1. 选择模板页面' : '1. Choose template pages'}</h3>
          <label htmlFor="deck-page-filter">{zh ? '页面类型' : 'Page type'}</label><select id="deck-page-filter" value={pageFilter} disabled={!!operation} onChange={event => { setPageFilter(event.target.value); setCandidateId(source.template.slides.find(slide => !event.target.value || slide.pageType === event.target.value)?.templateId ?? ''); }}><option value="">{zh ? '全部类型' : 'All types'}</option>{Array.from(new Set(source.template.slides.map(slide => slide.pageType))).map(type => <option key={type} value={type}>{pageLabel(type, zh)}</option>)}</select>
          <label htmlFor="deck-template-page">{zh ? '模板页面' : 'Template page'}</label><select id="deck-template-page" value={candidateId} disabled={!!operation} onChange={event => setCandidateId(event.target.value)}>{candidates.map(slide => <option value={slide.templateId} key={slide.templateId}>{slide.slideNumber} · {pageLabel(slide.pageType, zh)} · {slide.templateId}</option>)}</select>
          {candidate && <p className={styles.hint}>{candidate.logic.length ? candidate.logic.join(' · ') : (zh ? '无额外页面逻辑约束' : 'No additional page logic')}</p>}
          <button className={styles.addButton} disabled={!!operation || !candidateId || deck.slides.length >= 200} onClick={() => void run(() => addSlide(candidateId))}>+ {zh ? '加入成稿' : 'Add to deck'}</button>
          <button className={styles.textButton} disabled={!!operation || !selectedInput} onClick={() => void run(() => replaceSlide(candidateId, activeSlide))}>{zh ? '替换当前成稿页（重置该页内容）' : 'Replace current page (reset its content)'}</button><button className={styles.addButton} disabled={!!operation} onClick={() => void run(useStarter)}>{zh ? '创建可复用成稿骨架' : 'Create reusable starter deck'}</button><p className={styles.hint}>{zh ? '按当前模板目录项数组合成稿，替换现有页面序列。随后可逐页改选模板和填写内容。' : 'Build a deck from the template’s contents count, replacing the current page sequence. Then change templates or content page by page.'}</p>
          <h3 className={styles.orderHeading}>{zh ? '成稿顺序' : 'Deck order'} <span>{deck.slides.length}</span></h3>
          {!deck.slides.length && <p className={styles.hint}>{zh ? '还没有页面。可重复选择同一模板。' : 'No pages yet. A template can be used more than once.'}</p>}
          <ol className={styles.order}>{deck.slides.map((slide, index) => <li key={`${index}-${slide.templateId}`}><button className={activeSlide === index ? styles.active : ''} aria-current={activeSlide === index ? 'step' : undefined} onClick={() => setActiveSlide(index)}><span>{String(index + 1).padStart(2, '0')}</span>{slide.templateId}</button><button title={zh ? '上移' : 'Move up'} aria-label={`${zh ? '上移第' : 'Move up slide'} ${index + 1}`} disabled={!!operation || !index} onClick={() => void run(() => moveSlide(index, -1))}>↑</button><button title={zh ? '下移' : 'Move down'} aria-label={`${zh ? '下移第' : 'Move down slide'} ${index + 1}`} disabled={!!operation || index === deck.slides.length - 1} onClick={() => void run(() => moveSlide(index, 1))}>↓</button><button aria-label={`${zh ? '移除第' : 'Remove slide'} ${index + 1}`} disabled={!!operation} onClick={() => void run(() => removeSlide(index))}>×</button></li>)}</ol>
        </aside>
        <div className={styles.editor}>
          <h3>{zh ? '2. 填充内容' : '2. Fill the content'}</h3>
          {selectedPage && selectedInput ? <>
            <div className={styles.slideHeading}><strong>{activeSlide + 1}. {pageLabel(selectedPage.pageType, zh)}</strong><span>{selectedPage.templateId}</span></div>
            {source.preview && <figure className={styles.preview}><SvgSlide model={source.preview} slideIndex={selectedPage.slideNumber - 1} patches={{}} textPreviews={previews} locale={locale}/><figcaption>{zh ? 'SVG 填充预览。字体、自动编号与 Office 最终渲染可能不同；此预览不参与认证。' : 'SVG content preview. Fonts, automatic numbering and final Office rendering may differ; this preview is not a certification.'}</figcaption></figure>}
            {selectedPage.nodes.map(node => field(node, selectedInput.nodes?.[node.key]))}
            {selectedPage.lists.map(list => <fieldset className={styles.list} key={list.key}><legend>{list.key} · {list.items.length} {zh ? '项（浏览器保持原项数）' : 'items (original count retained)'}</legend>{list.items.map((item, index) => <div className={styles.listItem} key={item.itemIndex}><strong>{zh ? '第' : 'Item'} {index + 1} {zh ? '项' : ''}</strong>{item.components.map(node => field(node, selectedInput.lists?.[list.key]?.[index]?.[node.key], list.key, index))}</div>)}</fieldset>)}
            {!selectedPage.nodes.length && !selectedPage.lists.length && <p className={styles.hint}>{zh ? '此页没有可填充标记，原样保留。' : 'This page has no fillable marks and will be retained unchanged.'}</p>}
          </> : <div className={styles.empty}>{zh ? '从左侧加入模板页面，开始填写。' : 'Add a template page on the left to start filling.'}</div>}
        </div>
      </div>
      <footer className={styles.output}>
        <div><h3>{zh ? '3. 校验并生成 PPTX' : '3. Validate and generate PPTX'}</h3><p className={styles.hint}>{zh ? '完整成稿要求：封面、目录、3–6 个章节（每章含过渡页与内容页）、结尾；目录项数必须与章节数一致。当前不支持单页自由导出。' : 'A complete deck requires a cover, contents, 3–6 chapters (each with a transition and content), and closing. Contents must match the chapter count. Single-page export is not supported.'}</p><label htmlFor="deck-output-title">{zh ? '成稿名称' : 'Deck name'}</label><input id="deck-output-title" value={deck.title ?? ''} maxLength={100} disabled={!!operation} onChange={event => setInput({ ...deckRef.current, title: event.target.value })}/></div>
        <div className={styles.outputActions}><button className="button button-secondary" disabled={!!operation || !deck.slides.length} onClick={() => void run(validate)}>{zh ? '校验内容' : 'Validate content'}</button><button className="button button-primary" disabled={!!operation || !valid} onClick={() => void run(generate)}>{zh ? '生成 PPTX' : 'Generate PPTX'}</button></div>
        {check && <div className={check.issues.length ? styles.error : styles.validation} role="status">{check.issues.length ? <><strong>{zh ? `请先修复 ${check.issues.length} 个问题` : `Resolve ${check.issues.length} issues first`}</strong><ul>{check.issues.slice(0, 30).map((issue, index) => <li key={index}>{issue}</li>)}</ul>{check.issues.length > 30 && <p>{zh ? '仅显示前 30 项。' : 'Showing the first 30 issues.'}</p>}</> : (zh ? '内容校验通过。修改任何字段或页面顺序后需要重新校验。' : 'Content validation passed. Changes to content or page order require validation again.')}</div>}
        {download && <div className={styles.download} role="status"><div><strong>{zh ? 'PPTX 已生成，结构检查通过' : 'PPTX generated; structural checks passed'}</strong><p>{download.slideCount} {zh ? '页' : 'slides'} · {(download.bytes / 1024).toFixed(0)} KB · {zh ? '尚未通过 Office / 视觉认证' : 'Not Office / visually certified'}</p></div><a className="button button-primary" href={download.url} download={download.name}>{zh ? '下载生成的 PPTX ↓' : 'Download generated PPTX ↓'}</a></div>}
      </footer>
    </>}
    <details className={styles.limits}><summary>{zh ? '当前支持范围与验证限制' : 'Supported features and validation limits'}</summary><p>{zh ? '浏览器版本填充文本并自动编号；保留现有图片、图标、背景和列表项数。不替换图片，不改写图表/表格，不调整主题色或增加列表项。超出范围的输入会被拒绝，不会静默降级。' : 'The browser fills text and automatic numbers, preserving existing artwork and list counts. Image replacement, chart/table edits, palette changes and list resizing are not supported. Unsupported input is rejected rather than silently downgraded.'}</p><p>{zh ? '长度与 OOXML 结构校验不能保证视觉效果。草稿包未经过发布审查；即使核对了 SVG 边界审查，仍需在 PowerPoint 或 LibreOffice 中检查实际字体、溢出和布局。' : 'Length and OOXML checks cannot guarantee appearance. Draft bundles are not release-reviewed. Even after an SVG boundary review, check fonts, overflow and layout in PowerPoint or LibreOffice.'}</p>{source?.template.limitations.map((limitation, index) => <p key={index}>{limitation}</p>)}</details>
  </section>;
}
