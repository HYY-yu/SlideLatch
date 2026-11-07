import JSZip from 'jszip';
import { assertBrowserPackageBudget, BROWSER_PACKAGE_BUDGET, type BrowserPackageEntry } from './browser-package-budget.ts';
import { analyzeTemplate } from '../../packages/ppt-dsl/src/pptx/analyze.ts';
import { lintTemplate } from '../../packages/ppt-dsl/src/lint.ts';
import { selectCandidates, type CandidateRequest } from '../../packages/ppt-dsl/src/select.ts';
import { assertRuntimeManifestComplete, TEMPLATE_MANIFEST_VERSION } from '../../packages/ppt-dsl/src/manifest-contract.ts';
import { validateDeckContent } from '../../packages/ppt-dsl/src/validation-core.ts';
import { bindDeterministicNumbers, formatDeterministicNumber } from '../../packages/ppt-dsl/src/deck-numbers.ts';
import { relationshipPartForOwner, ownerPartForRelationshipPart, resolveRelationshipTarget } from '../../packages/ppt-dsl/src/pptx/relationships.ts';
import { verifyDeckPackage } from '../../packages/ppt-dsl/src/pptx/verify.ts';
import { readSourceSlides, NS, child, children, ownProperties } from '../pptx/xml.ts';
import { validateWorkspace } from '../pptx/validation.ts';
import type { ComponentManifest, DeckInput, DeckInputSlide, SlideManifest, TemplateManifest } from '../../packages/ppt-dsl/src/types.ts';
export type { CandidateRequest, ComponentManifest, DeckInput, DeckInputSlide, SlideManifest, TemplateManifest };

const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const SLIDE_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml';
const LIMITATIONS = [
  'Browser output is structurally checked, not a reviewed template release or native PowerPoint visual certification.',
  'Edited text must have uniform source run and paragraph formatting and no soft breaks or fields; unsupported source text is preserved only when unchanged.',
  'Only plain text and deterministic numbers are filled. Original images, backgrounds, icons, charts and tables are retained; asset replacement, data fill, rich text and palettes are not supported.',
  'Lists must retain their authored item count; resizing a dynamic list is not supported in this browser runtime.',
  'Speaker notes and unused package parts are removed. Source typography and artwork are retained; font availability, text fit, animation playback and Office opening remain unverified.',
];
export interface BrowserTemplate {
  manifest: TemplateManifest;
  slides: SlideManifest[];
  sourceSha256: string;
  limitations: string[];
}
export interface BrowserDeckReport {
  status: 'structural_pass';
  runtimePackageValidation: 'passed';
  slideCount: number;
  templateSha256: string;
  nativeOfficeValidation: 'not_run';
  visualGuarantee: false;
  limitations: string[];
}
// The handle cannot be forged or have its source bytes swapped after validation.
type SourceState = {bytes: Uint8Array; textPolicies: Map<string, {text: string; uniform: boolean}>};
const sources = new WeakMap<BrowserTemplate, SourceState>();
const xml = (text: string, path: string): Document => {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error(`BROWSER_XML_UNSAFE: ${path}`);
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error(`BROWSER_XML_PARSE: ${path}`);
  return doc;
};
const serialize = (doc: Document) => new XMLSerializer().serializeToString(doc);
const all = (doc: Element | Document, namespace: string, name: string) => Array.from(doc.getElementsByTagNameNS(namespace, name));
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
async function digest(bytes: Uint8Array): Promise<string> {
  const buffer = new Uint8Array(bytes).buffer;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), n => n.toString(16).padStart(2, '0')).join('');
}
function bytesFor(template: BrowserTemplate): Uint8Array {
  const bytes = sources.get(template);
  if (!bytes) throw new Error('BROWSER_TEMPLATE_HANDLE: load the template before using it');
  return bytes.bytes;
}
async function part(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path); if (!file) throw new Error(`BROWSER_PART_MISSING: ${path}`);
  return file.async('string');
}
function relationships(doc: Document): Element[] { return all(doc, REL, 'Relationship'); }
function target(owner: string | undefined, rel: Element): string {
  const raw = rel.getAttribute('Target') ?? '';
  if (!raw || /[\\?#\u0000-\u001f]/.test(raw) || /^[a-z][a-z0-9+.-]*:/i.test(raw)) throw new Error(`BROWSER_PART_TARGET: ${raw}`);
  const resolved = resolveRelationshipTarget(owner, raw);
  if (resolved.startsWith('../') || resolved.startsWith('/') || resolved === '..') throw new Error(`BROWSER_PART_TARGET: ${raw}`);
  return resolved;
}

/** Compile exact marked bytes locally. A compiled manifest is checked against fresh analysis, not trusted by its claimed hash. */
export async function loadBrowserTemplate(bytes: ArrayBuffer | Uint8Array, options: {manifest?: unknown; lock?: unknown} = {}): Promise<BrowserTemplate> {
  const pinned = new Uint8Array(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  if (!pinned.length || pinned.length > 50 * 1024 * 1024) throw new Error('BROWSER_TEMPLATE_SIZE');
  // Snapshot caller-owned JSON before any asynchronous work.
  const supplied = options.manifest === undefined ? undefined : clone(options.manifest);
  const lock = options.lock === undefined ? undefined : clone(options.lock);
  const sourceSha256 = await digest(pinned);
  if (supplied !== undefined) {
    if (!object(supplied) || supplied.manifestVersion !== TEMPLATE_MANIFEST_VERSION || supplied.templateSha256 !== sourceSha256) throw new Error('BROWSER_MANIFEST_FINGERPRINT');
    assertRuntimeManifestComplete(supplied as unknown as TemplateManifest);
  }
  if (lock !== undefined && (!supplied || !object(lock) || lock.manifestVersion !== TEMPLATE_MANIFEST_VERSION || lock.templateSha256 !== sourceSha256)) throw new Error('BROWSER_LOCK_FINGERPRINT');
  const zip = await JSZip.loadAsync(pinned);
  assertBrowserPackageBudget(packageEntries(zip));
  await inspectPackage(zip);
  const sourceSlides = await readSourceSlides(pinned);
  const workspaceIssues = validateWorkspace(sourceSlides, {});
  if (workspaceIssues.length) throw new Error(`BROWSER_MARKS_INVALID: ${workspaceIssues.join('; ')}`);
  const manifest = await analyzeTemplate(zip, 'template.pptx');
  manifest.manifestVersion = TEMPLATE_MANIFEST_VERSION;
  manifest.templateSha256 = sourceSha256;
  const lint = lintTemplate(manifest);
  if (lint.errors.length) throw new Error(`BROWSER_CONTRACT_INVALID: ${lint.errors.join('; ')}`);
  assertRuntimeManifestComplete(manifest);
  if (supplied && (supplied.slideCount !== manifest.slideCount || canonical(supplied.slides) !== canonical(manifest.slides))) throw new Error('BROWSER_MANIFEST_CONTRACT_MISMATCH');
  const handle = freeze({ manifest, slides: manifest.slides, sourceSha256, limitations: [...LIMITATIONS] });
  const textPolicies: SourceState['textPolicies'] = new Map();
  for (const slide of sourceSlides) {
    const doc = xml(await part(zip, slide.path), slide.path);
    for (const node of slide.nodes.filter(n => n.hasTextBody)) {
      const props = all(doc, NS.p, 'cNvPr').find(p => p.getAttribute('id') === node.id)!;
      const shape = props.parentNode!.parentNode as Element;
      textPolicies.set(`${slide.path}#${node.id}`, {text: node.text, uniform: hasUniformTextFormatting(shape)});
    }
  }
  sources.set(handle, {bytes: pinned, textPolicies});
  return handle;
}

/** Existing source artwork is available for preservation, never interpreted as a replacement asset. */
export function selectBrowserCandidates(template: BrowserTemplate, request: CandidateRequest): SlideManifest[] {
  bytesFor(template);
  return selectCandidates(template.manifest, request).filter(slide => !unsupportedSlide(slide).length &&
    Object.entries(request.listCounts ?? {}).every(([key, count]) => slide.lists.find(list => list.key === key)?.items.length === count));
}
export function createBrowserSlideInput(template: BrowserTemplate, templateId: string): DeckInputSlide {
  bytesFor(template);
  const slide = template.slides.find(candidate => candidate.templateId === templateId);
  if (!slide) throw new Error(`BROWSER_TEMPLATE_ID: ${templateId}`);
  const textFields = (components: ComponentManifest[]) => Object.fromEntries(components.filter(c => c.kind === 'text').map(c => [c.key, sources.get(template)!.textPolicies.get(`${slide.slidePath}#${c.locator.shapeId}`)?.text ?? c.sampleContent]));
  return { templateId, nodes: textFields(slide.nodes), lists: Object.fromEntries(slide.lists.map(list => [list.key, list.items.map(item => textFields(item.components))])) };
}
/** A deterministic starter, with one content page per directory item; sample text remains user-editable. */
export function createBrowserDeckInput(template: BrowserTemplate): DeckInput {
  const candidates = (pageType: SlideManifest['pageType']) => selectBrowserCandidates(template, {pageType, availableAssetKinds: ['image', 'background', 'icon']});
  const cover = candidates('封面页')[0], ending = candidates('结尾页')[0];
  const transition = candidates('章节过渡页').find(slide => slide.nodes.some(c => c.kind === 'number'));
  const content = candidates('内容页')[0];
  const directory = candidates('目录页').find(slide => { const n = slide.lists.reduce((sum, list) => sum + list.items.length, 0); return n >= 3 && n <= 6; });
  if (!cover || !ending || !transition || !content || !directory) return {slides: []};
  const count = directory.lists.reduce((sum, list) => sum + list.items.length, 0);
  return {slides: [cover, directory, ...Array.from({length: count}, () => [transition, content]).flat(), ending].map(s => createBrowserSlideInput(template, s.templateId))};
}
function unsupportedSlide(slide: SlideManifest): string[] {
  const errors: string[] = [];
  for (const component of [...slide.nodes, ...slide.lists.flatMap(list => list.items.flatMap(item => item.components))]) {
    if (component.kind === 'table' || component.kind === 'chart') errors.push(`BROWSER_UNSUPPORTED_DATA: ${slide.templateId}.${component.key}`);
  }
  return errors;
}
function inputShapeErrors(input: unknown): string[] {
  if (!object(input) || Object.keys(input).some(k => !['title', 'slides'].includes(k)) || input.title !== undefined && typeof input.title !== 'string' || !Array.isArray(input.slides) || !input.slides.length || input.slides.length > 200) return ['BROWSER_INPUT_SCHEMA: expected 1–200 slides, optional title, no palette'];
  for (const slide of input.slides) {
    if (!object(slide) || Object.keys(slide).some(k => !['templateId', 'nodes', 'lists', 'sourceRefs'].includes(k)) || typeof slide.templateId !== 'string') return ['BROWSER_SLIDE_SCHEMA'];
    if (slide.nodes !== undefined && !object(slide.nodes) || slide.lists !== undefined && !object(slide.lists)) return ['BROWSER_FIELDS_SCHEMA'];
    if (slide.sourceRefs !== undefined && (!Array.isArray(slide.sourceRefs) || slide.sourceRefs.some(v => typeof v !== 'string'))) return ['BROWSER_SOURCE_REFS_SCHEMA'];
    if (Object.values((slide.lists ?? {}) as Record<string, unknown>).some(items => !Array.isArray(items) || items.length > 1000 || items.some(item => !object(item)))) return ['BROWSER_LIST_SCHEMA'];
  }
  return [];
}
async function validatePinned(template: BrowserTemplate, input: DeckInput): Promise<string[]> {
  const shapeErrors = inputShapeErrors(input); if (shapeErrors.length) return shapeErrors;
  const errors: string[] = [];
  for (const entry of input.slides) {
    const slide = template.slides.find(s => s.templateId === entry.templateId); if (!slide) continue;
    errors.push(...unsupportedSlide(slide));
    for (const list of slide.lists) if (entry.lists?.[list.key]?.length !== list.items.length) errors.push(`BROWSER_UNSUPPORTED_LIST_RESIZE: ${entry.templateId}.${list.key} requires ${list.items.length} authored items`);
    for (const value of [...Object.values(entry.nodes ?? {}), ...Object.values(entry.lists ?? {}).flatMap(items => items.flatMap(item => Object.values(item)))]) {
      if (typeof value !== 'string') errors.push('BROWSER_PLAIN_TEXT_ONLY: numbers are bound automatically; omit asset, rich-text and data fields');
      else if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(value) || /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(value)) errors.push('BROWSER_XML_TEXT_INVALID');
    }
  }
  const bound = bindDeterministicNumbers(template.manifest, input);
  for (const entry of bound.slides) {
    const slide = template.slides.find(s => s.templateId === entry.templateId); if (!slide) continue;
    const check = (component: ComponentManifest, value: unknown) => {
      if (!['text', 'number'].includes(component.kind)) return;
      const policy = sources.get(template)!.textPolicies.get(`${slide.slidePath}#${component.locator.shapeId}`);
      const text = component.kind === 'number' ? formatDeterministicNumber(value as number, component.numberWidth) : value;
      if (!policy || text !== policy.text && !policy.uniform) errors.push(`BROWSER_UNSUPPORTED_TEXT_FORMATTING: ${slide.templateId}.${component.key} has mixed formatting, a soft break or a field; keep its original text or use the CLI runtime`);
    };
    slide.nodes.forEach(c => check(c, entry.nodes?.[c.key]));
    slide.lists.forEach(list => list.items.forEach((item, index) => item.components.forEach(c => check(c, entry.lists?.[list.key]?.[index]?.[c.key]))));
  }
  // Do not let malformed unsupported values reach a validator expecting typed values.
  if (errors.length) return [...new Set(errors)];
  return [...new Set(await validateDeckContent(template.manifest, input))];
}
export async function validateBrowserDeck(template: BrowserTemplate, input: DeckInput): Promise<string[]> {
  bytesFor(template);
  return validatePinned(template, clone(input));
}

/** Patch native OOXML, clone slides independently, preserve their package dependencies, and recheck the resulting package. */
export async function generateBrowserDeck(template: BrowserTemplate, input: DeckInput): Promise<{bytes: Uint8Array; report: BrowserDeckReport}> {
  const source = bytesFor(template), pinned = clone(input);
  const errors = await validatePinned(template, pinned);
  if (errors.length) throw new Error(`BROWSER_DECK_INVALID:\n${errors.join('\n')}`);
  const bound = bindDeterministicNumbers(template.manifest, pinned);
  const zip = await JSZip.loadAsync(source);
  const entries = packageEntries(zip);
  // Bound clone amplification before reading or materializing any selected slide.
  const sizes = new Map(entries.map(entry => [entry.path, entry.uncompressedBytes]));
  assertBrowserPackageBudget([...entries, ...bound.slides.map((entry, i) => ({path: `clone-${i}.xml`, uncompressedBytes: sizes.get(template.slides.find(s => s.templateId === entry.templateId)!.slidePath)!}))]);
  const presentation = xml(await part(zip, 'ppt/presentation.xml'), 'ppt/presentation.xml');
  if (all(presentation, '*', 'sectionLst').length || all(presentation, NS.p, 'custShowLst').length) throw new Error('BROWSER_UNSUPPORTED_PRESENTATION: sections and custom shows require the CLI runtime');
  const rels = xml(await part(zip, 'ppt/_rels/presentation.xml.rels'), 'presentation.xml.rels');
  const slideList = all(presentation, NS.p, 'sldIdLst')[0];
  if (!slideList) throw new Error('BROWSER_PRESENTATION_SLIDES');
  while (slideList.firstChild) slideList.removeChild(slideList.firstChild);
  for (const node of all(presentation, NS.p, 'notesMasterIdLst')) node.parentNode?.removeChild(node);
  for (const rel of relationships(rels)) if (/\/(slide|notesMaster)$/.test(rel.getAttribute('Type') ?? '')) rel.parentNode?.removeChild(rel);
  const occupied = new Set(Object.keys(zip.files));
  const outputPaths: string[] = [];
  let index = 1;
  for (const _slide of bound.slides) { // Avoid overwriting any source slide part, including unusual source filenames.
    while (occupied.has(`ppt/slides/slide${index}.xml`)) index++;
    const name = `ppt/slides/slide${index++}.xml`; outputPaths.push(name); occupied.add(name);
  }
  const sourceToOutput = new Map<string, string>();
  bound.slides.forEach((entry, i) => { const path = template.slides.find(s => s.templateId === entry.templateId)!.slidePath; if (!sourceToOutput.has(path)) sourceToOutput.set(path, outputPaths[i]); });
  const relationIds = new Set(relationships(rels).map(r => r.getAttribute('Id')));
  let nextRelationNumber = 1;
  const expectedTexts: Map<string, string>[] = [];
  for (const [i, entry] of bound.slides.entries()) {
    const contract = template.slides.find(s => s.templateId === entry.templateId)!;
    const outputPath = outputPaths[i];
    const doc = xml(await part(zip, contract.slidePath), contract.slidePath);
    const expected = new Map<string, string>(); expectedTexts.push(expected);
    const fill = (component: ComponentManifest, value: unknown) => {
      if (!['text', 'number'].includes(component.kind)) return;
      const props = all(doc, NS.p, 'cNvPr').find(p => p.getAttribute('id') === component.locator.shapeId);
      const shape = props?.parentNode?.parentNode as Element | undefined;
      if (!shape || ownProperties(shape) !== props) throw new Error(`BROWSER_LOCATOR_MISSING: ${component.key}`);
      const text = component.kind === 'number' ? formatDeterministicNumber(value as number, component.numberWidth) : value as string;
      const policy = sources.get(template)!.textPolicies.get(`${contract.slidePath}#${component.locator.shapeId}`);
      if (text !== policy?.text) replacePlainText(shape, text);
      expected.set(component.locator.shapeId, text);
    };
    contract.nodes.forEach(component => fill(component, entry.nodes?.[component.key]));
    for (const list of contract.lists) list.items.forEach((item, n) => item.components.forEach(component => fill(component, entry.lists?.[list.key]?.[n]?.[component.key])));
    for (const props of all(doc, NS.p, 'cNvPr')) {
      if (props.getAttribute('name') === 'runtime-page-number') {
        const text = String(i + 1).padStart(2, '0'); replacePlainText(props.parentNode!.parentNode as Element, text); expected.set(props.getAttribute('id')!, text);
      }
      if ((props.getAttribute('name') ?? '').trim().startsWith('@')) props.setAttribute('name', `slidelatch-filled-${props.getAttribute('id')}`);
    }
    // Creation IDs are optional metadata, but duplicates across repeated source slides are invalid.
    for (const creationId of all(doc, '*', 'creationId')) creationId.parentNode?.removeChild(creationId);
    zip.file(outputPath, serialize(doc), {createFolders: false});
    const originalRels = zip.file(relationshipPartForOwner(contract.slidePath));
    if (originalRels) {
      const slideRels = xml(await originalRels.async('string'), contract.slidePath);
      for (const rel of relationships(slideRels)) {
        const type = rel.getAttribute('Type') ?? '';
        if (/\/(notesSlide|comments|commentAuthors)$/.test(type)) { rel.parentNode?.removeChild(rel); continue; }
        if (rel.getAttribute('TargetMode') === 'External') continue;
        const originalTarget = target(contract.slidePath, rel);
        if (type.endsWith('/slide')) {
          const destination = originalTarget === contract.slidePath ? outputPath : sourceToOutput.get(originalTarget);
          if (!destination) throw new Error('BROWSER_UNSUPPORTED_SLIDE_LINK: target slide was not selected');
          rel.setAttribute('Target', `/${destination}`);
        } else rel.setAttribute('Target', `/${originalTarget}`);
      }
      zip.file(relationshipPartForOwner(outputPath), serialize(slideRels), {createFolders: false});
    }
    while (relationIds.has(`rId${nextRelationNumber}`)) nextRelationNumber++;
    const id = `rId${nextRelationNumber++}`; relationIds.add(id);
    const rel = rels.createElementNS(REL, 'Relationship'); rel.setAttribute('Id', id); rel.setAttribute('Type', `${NS.r}/slide`); rel.setAttribute('Target', `/${outputPath}`); rels.documentElement.appendChild(rel);
    const slide = presentation.createElementNS(NS.p, 'p:sldId'); slide.setAttribute('id', String(256 + i)); slide.setAttributeNS(NS.r, 'r:id', id); slideList.appendChild(slide);
  }
  zip.file('ppt/presentation.xml', serialize(presentation)); zip.file('ppt/_rels/presentation.xml.rels', serialize(rels));
  await updateMetadata(zip, bound);
  await prunePackage(zip);
  // Package traversal must not bring hidden source slides or speaker notes back through inherited navigation.
  const outputSet = new Set(outputPaths);
  for (const path of Object.keys(zip.files).filter(path => !zip.files[path].dir)) {
    if (/^ppt\/slides\/[^/]+\.xml$/.test(path) && !outputSet.has(path) || /^ppt\/notesSlides\//.test(path)) throw new Error(`BROWSER_RETAINED_SOURCE_CONTENT: ${path}`);
  }
  const types = xml(await part(zip, '[Content_Types].xml'), '[Content_Types].xml');
  for (const item of all(types, CT, 'Override')) if (!zip.file((item.getAttribute('PartName') ?? '').replace(/^\//, ''))) item.parentNode?.removeChild(item);
  for (const path of outputPaths) { const item = types.createElementNS(CT, 'Override'); item.setAttribute('PartName', `/${path}`); item.setAttribute('ContentType', SLIDE_TYPE); types.documentElement.appendChild(item); }
  zip.file('[Content_Types].xml', serialize(types));
  await inspectPackage(zip);
  const bytes = await zip.generateAsync({type: 'uint8array', compression: 'DEFLATE'});
  // Gate the actual archive with the same verifier used by the CLI, not a browser-only approximation.
  const verification = await verifyDeckPackage(await JSZip.loadAsync(bytes));
  if (!verification.passed) throw new Error(`BROWSER_OUTPUT_VERIFICATION: ${verification.errors.join('; ')}`);
  const slides = await readSourceSlides(bytes);
  if (slides.length !== bound.slides.length || slides.some((slide, i) => slide.path !== outputPaths[i])) throw new Error('BROWSER_OUTPUT_ORDER');
  for (const [i, texts] of expectedTexts.entries()) for (const [shapeId, text] of texts) if (slides[i].nodes.find(n => n.id === shapeId)?.text !== text) throw new Error(`BROWSER_OUTPUT_TEXT: ${i}/${shapeId}`);
  return {bytes, report: {status: 'structural_pass', runtimePackageValidation: 'passed', slideCount: slides.length, templateSha256: template.sourceSha256, nativeOfficeValidation: 'not_run', visualGuarantee: false, limitations: [...LIMITATIONS]}};
}

function elementSignature(node: Element | undefined): string {
  if (!node) return '';
  return canonical({namespace: node.namespaceURI, name: node.localName, attributes: Object.fromEntries(Array.from(node.attributes).filter(a => a.namespaceURI !== 'http://www.w3.org/2000/xmlns/').map(a => [`${a.namespaceURI ?? ''}:${a.localName}`, a.value])), children: children(node).map(elementSignature)});
}
/** Be conservative: editing cannot silently flatten distinct source character or paragraph styles. */
function hasUniformTextFormatting(shape: Element): boolean {
  const body = child(shape, 'txBody'); if (!body || shape.localName !== 'sp') return false;
  const paragraphs = children(body).filter(p => p.localName === 'p'); if (!paragraphs.length) return false;
  if (all(body, NS.a, 'fld').length || all(body, NS.a, 'br').length) return false;
  const paragraphStyles = paragraphs.map(p => `${elementSignature(child(p, 'pPr'))}|${elementSignature(child(p, 'endParaRPr'))}`);
  const runs = paragraphs.flatMap(p => children(p).filter(r => r.localName === 'r'));
  const runStyles = runs.map(r => elementSignature(child(r, 'rPr')));
  return new Set(paragraphStyles).size <= 1 && new Set(runStyles).size <= 1;
}
/** Keep uniform source body, paragraph and run formatting; never reconstruct fixed artwork. */
function replacePlainText(shape: Element, value: string): void {
  if (!hasUniformTextFormatting(shape)) throw new Error('BROWSER_UNSUPPORTED_TEXT_FORMATTING');
  const body = child(shape, 'txBody');
  if (!body || shape.localName !== 'sp' || typeof value !== 'string') throw new Error('BROWSER_UNSUPPORTED_TEXT_TARGET');
  const paragraphs = children(body).filter(n => n.localName === 'p');
  const first = paragraphs[0]; if (!first) throw new Error('BROWSER_TEXT_PARAGRAPH');
  const doc = shape.ownerDocument!;
  const firstRun = paragraphs.flatMap(p => children(p).filter(node => node.localName === 'r'))[0];
  const pPr = child(first, 'pPr'), style = firstRun && child(firstRun, 'rPr'), end = child(first, 'endParaRPr');
  const replacement = value.split('\n').map(line => {
    const paragraph = first.cloneNode(false) as Element;
    if (pPr) paragraph.appendChild(pPr.cloneNode(true));
    const run = doc.createElementNS(NS.a, 'a:r'); if (style) run.appendChild(style.cloneNode(true));
    const text = doc.createElementNS(NS.a, 'a:t'); text.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve'); text.textContent = line; run.appendChild(text); paragraph.appendChild(run);
    if (end) paragraph.appendChild(end.cloneNode(true));
    return paragraph;
  });
  paragraphs.forEach(p => body.removeChild(p)); replacement.forEach(p => body.appendChild(p));
}
async function updateMetadata(zip: JSZip, input: DeckInput): Promise<void> {
  const app = zip.file('docProps/app.xml');
  if (app) {
    const doc = xml(await app.async('string'), 'docProps/app.xml');
    for (const node of all(doc, '*', 'Slides')) node.textContent = String(input.slides.length);
    for (const node of all(doc, '*', 'Notes')) node.textContent = '0';
    for (const name of ['HeadingPairs', 'TitlesOfParts']) for (const node of all(doc, '*', name)) node.parentNode?.removeChild(node);
    zip.file('docProps/app.xml', serialize(doc));
  }
  const core = zip.file('docProps/core.xml');
  if (core && input.title !== undefined) {
    const doc = xml(await core.async('string'), 'docProps/core.xml');
    const title = all(doc, 'http://purl.org/dc/elements/1.1/', 'title')[0] ?? doc.createElementNS('http://purl.org/dc/elements/1.1/', 'dc:title');
    title.textContent = input.title; if (!title.parentNode) doc.documentElement.appendChild(title); zip.file('docProps/core.xml', serialize(doc));
  }
  const root = xml(await part(zip, '_rels/.rels'), '_rels/.rels');
  for (const rel of relationships(root)) if ((rel.getAttribute('Type') ?? '').endsWith('/thumbnail')) rel.parentNode?.removeChild(rel);
  zip.file('_rels/.rels', serialize(root));
}
async function prunePackage(zip: JSZip): Promise<void> {
  const keep = new Set(['[Content_Types].xml', '_rels/.rels']);
  const queue: Array<string | undefined> = [undefined];
  while (queue.length) {
    const owner = queue.pop(); const relPath = owner ? relationshipPartForOwner(owner) : '_rels/.rels';
    const file = zip.file(relPath); if (!file) continue; keep.add(relPath);
    const doc = xml(await file.async('string'), relPath);
    for (const rel of relationships(doc)) {
      if (rel.getAttribute('TargetMode') === 'External') continue;
      const path = target(owner, rel);
      if (!zip.file(path)) throw new Error(`BROWSER_DANGLING_RELATION: ${relPath} -> ${path}`);
      if (!keep.has(path)) { keep.add(path); queue.push(path); }
    }
  }
  for (const path of Object.keys(zip.files)) if (!zip.files[path].dir && !keep.has(path)) zip.remove(path);
}
/** Structural checks do not imply native rendering or text-fit verification. */
async function inspectPackage(zip: JSZip): Promise<void> {
  const names = Object.keys(zip.files).filter(name => !zip.files[name].dir);
  if (names.length > BROWSER_PACKAGE_BUDGET.parts) throw new Error('BROWSER_PACKAGE_TOO_LARGE');
  const docs = new Map<string, Document>();
  let xmlSize = 0;
  for (const name of names) {
    if (name.startsWith('/') || name.split('/').includes('..') || name.includes('\\') || zip.files[name].unsafeOriginalName && zip.files[name].unsafeOriginalName !== name) throw new Error(`BROWSER_PACKAGE_PATH: ${name}`);
    if (/\.(xml|rels)$/.test(name)) {
      const content = await part(zip, name); xmlSize += content.length;
      if (xmlSize > BROWSER_PACKAGE_BUDGET.xmlTotalBytes || content.length > BROWSER_PACKAGE_BUDGET.xmlPartBytes) throw new Error('BROWSER_PACKAGE_XML_TOO_LARGE');
      docs.set(name, xml(content, name));
    }
  }
  if (!docs.has('[Content_Types].xml') || !docs.has('_rels/.rels') || !docs.has('ppt/presentation.xml')) throw new Error('BROWSER_PACKAGE_STRUCTURE');
  const types = docs.get('[Content_Types].xml')!;
  const overrides = new Map(all(types, CT, 'Override').map(item => [(item.getAttribute('PartName') ?? '').replace(/^\//, ''), item.getAttribute('ContentType')]));
  const defaults = new Set(all(types, CT, 'Default').map(item => item.getAttribute('Extension')));
  if ([...overrides.values()].some(type => /macroEnabled|vbaProject/i.test(type ?? ''))) throw new Error('BROWSER_UNSUPPORTED_MACROS');
  for (const name of names) if (name !== '[Content_Types].xml' && !overrides.has(name) && !defaults.has(name.split('.').at(-1)!)) throw new Error(`BROWSER_CONTENT_TYPE: ${name}`);
  for (const [name, doc] of docs) {
    if (name.endsWith('.rels')) {
      const owner = ownerPartForRelationshipPart(name);
      if (name !== '_rels/.rels' && (!owner || !zip.file(owner))) throw new Error(`BROWSER_RELATION_OWNER: ${name}`);
      const ids = new Set<string>();
      for (const rel of relationships(doc)) {
        const id = rel.getAttribute('Id') ?? '';
        if (!id || ids.has(id) || !rel.getAttribute('Type') || !rel.getAttribute('Target')) throw new Error(`BROWSER_RELATION_ID: ${name}`);
        ids.add(id);
        // A master/layout link cannot be mapped unambiguously when the target slide is reused.
        // Notes have normal slide back-links and are removed before output; own-slide links are remapped.
        if ((rel.getAttribute('Type') ?? '').endsWith('/slide') && owner !== 'ppt/presentation.xml' && !/^ppt\/(?:slides|notesSlides)\/[^/]+\.xml$/.test(owner ?? '')) throw new Error(`BROWSER_UNSUPPORTED_INHERITED_SLIDE_LINK: ${name}`);
        if (rel.getAttribute('TargetMode') === 'External') {
          if (!(rel.getAttribute('Type') ?? '').endsWith('/hyperlink')) throw new Error(`BROWSER_UNSUPPORTED_EXTERNAL_ASSET: ${name}`);
        } else if (!zip.file(target(owner, rel))) throw new Error(`BROWSER_DANGLING_RELATION: ${name} -> ${rel.getAttribute('Target')}`);
      }
    } else if (name.endsWith('.xml')) {
      const relationDoc = docs.get(relationshipPartForOwner(name));
      const relationIds = new Set(relationDoc ? relationships(relationDoc).map(rel => rel.getAttribute('Id')) : []);
      for (const element of all(doc, '*', '*')) for (const attribute of Array.from(element.attributes)) if (attribute.namespaceURI === NS.r && !relationIds.has(attribute.value)) throw new Error(`BROWSER_RELATION_REFERENCE: ${name} ${attribute.value}`);
    }
  }
}

function packageEntries(zip: JSZip): BrowserPackageEntry[] {
  return Object.values(zip.files).filter(entry => !entry.dir).map(entry => {
    // JSZip retains the ZIP central-directory size on its compressed entry; reading it does not inflate data.
    const metadata = entry as typeof entry & {_data?: {uncompressedSize?: number}};
    return {path: entry.name, uncompressedBytes: metadata._data?.uncompressedSize ?? Number.NaN};
  });
}
