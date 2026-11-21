import type { TextMeasureEvidence, WideTextSamples } from './constraint-search.ts';

const wideCandidates = {
  cjk: '市场客户服务管理项目团队增长组织业务资源阶段计划财务发展投资运营研发目标风险沟通战略成本执行支持系统协作报告方案数据分析用户流程完成结果问题资产建设趋势建议重点质量需求绩效平台技术效率影响設計專案臺灣閱讀國際開發變動權益開關還邊體疆鬱寬響鐵龍龜',
  latin: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
};

function findPreviewText(root: SVGSVGElement, key: string) {
  const matches = Array.from(root.querySelectorAll<SVGForeignObjectElement>('foreignObject[data-workflow-node-key]'))
    .filter(element => element.getAttribute('data-workflow-node-key') === key);
  return matches.length === 1 ? matches[0] : null;
}

async function settle(promise: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise.then(() => true), new Promise<boolean>(resolve => {
      timer = setTimeout(() => resolve(false), 1500);
    })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type GlyphMetrics = Pick<TextMetrics, 'width' | 'actualBoundingBoxLeft' | 'actualBoundingBoxRight'>;

export function rankWideGlyphs(candidates: string, measure: (glyph: string) => GlyphMetrics): string {
  return Array.from(new Set(candidates), glyph => {
    const metrics = measure(glyph);
    const ink = metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight;
    return { glyph, width: Math.max(metrics.width, Number.isFinite(ink) ? ink : 0) };
  }).filter(entry => entry.width > 0 && Number.isFinite(entry.width))
    .sort((first, second) => second.width - first.width)
    .map(entry => entry.glyph)
    .join('');
}

export async function readPreviewTextSamples(root: SVGSVGElement, key: string): Promise<WideTextSamples | undefined> {
  const foreign = findPreviewText(root, key);
  const doc = root.ownerDocument;
  const content = foreign?.querySelector<HTMLElement>('[data-workflow-text-content]');
  const view = doc.defaultView;
  if (!root.isConnected || !content || !view || !doc.fonts) return undefined;
  const run = content.querySelector('span') ?? content.querySelector('p') ?? content;
  const style = view.getComputedStyle(run);
  const font = [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].join(' ');
  const fontCandidates = wideCandidates.cjk + wideCandidates.latin;
  if (!(await settle(doc.fonts.load(font, fontCandidates))) || doc.fonts.status !== 'loaded' || !root.isConnected) return undefined;
  const ctx = doc.createElement('canvas').getContext('2d');
  if (!ctx) return undefined;
  ctx.font = font;
  ctx.fontKerning = style.fontKerning === 'none' ? 'none' : 'normal';
  const measure = (glyph: string) => ctx.measureText(glyph);
  const cjk = Array.from(rankWideGlyphs(wideCandidates.cjk, measure));
  const latin = Array.from(rankWideGlyphs(wideCandidates.latin, measure));
  if (cjk.length < 5 || latin.length < 4) return undefined;
  const [a, b, c, d] = latin;
  return { cjk: cjk.slice(0, 5).join(''), latin: a.repeat(7) + ' ' + (a + b + a + c) + ' ' + (a + d + a + b + a) + ' ' + a.repeat(3) };
}

function textLineRects(content: Element): DOMRect[] {
  const doc=content.ownerDocument;
  const walker=doc.createTreeWalker(content,NodeFilter.SHOW_TEXT);
  const range=doc.createRange();
  const rects:DOMRect[]=[];
  for(let text=walker.nextNode();text;text=walker.nextNode()){
    if(!text.textContent?.trim())continue;
    range.selectNodeContents(text);
    rects.push(...Array.from(range.getClientRects()));
  }
  return rects;
}

function overlappingTextKeys(root:SVGSVGElement,foreign:SVGForeignObjectElement,content:Element):string[]{
  const lines=textLineRects(content);
  const intersects=(a:DOMRect,b:DOMRect,tolerance:number)=>
    Math.min(a.right,b.right)-Math.max(a.left,b.left)>tolerance&&
    Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>tolerance;
  return Array.from(root.querySelectorAll<SVGForeignObjectElement>('foreignObject[data-workflow-node-key]')).flatMap(peer=>{
    if(peer===foreign||!lines.some(line=>intersects(line,peer.getBoundingClientRect(),1)))return [];
    const peerContent=peer.querySelector('[data-workflow-text-content]');
    const key=peer.getAttribute('data-workflow-node-key');
    if(!key||!peerContent)return [];
    const peerLines=textLineRects(peerContent);
    // Ignore edges of DOM line boxes where ascender/descender space can intersect without painting.
    return lines.some(line=>peerLines.some(rect=>intersects(line,rect,Math.max(1,Math.min(line.height,rect.height)*.18))))?[key]:[];
  });
}

export async function measurePreviewText(root:SVGSVGElement,key:string,options:{
  signal?:AbortSignal;
  isCurrent?:()=>boolean;
  scope?:'page-text'|'group-text';
  settle?:'layout';
  checkOverlap?:boolean;
}={}):Promise<TextMeasureEvidence>{
  const unknown=(reason:string):TextMeasureEvidence=>({fits:null,reason});
  const stop=()=>options.signal?.aborted?'cancelled':options.isCurrent&&!options.isCurrent()?'stale':null;
  if(stop())return unknown(stop()!);
  if(!root?.isConnected)return unknown('Preview root is not connected.');
  const doc=root.ownerDocument,win=doc.defaultView;
  if(!win||!doc.fonts)return unknown('Font readiness cannot be verified.');
  const fontsReady=await settle(doc.fonts.ready);
  if(stop())return unknown(stop()!);
  if(!fontsReady||doc.fonts.status!=='loaded')return unknown('Fonts did not settle.');
  if(options.settle!=='layout'){
    for(let frame=0;frame<2;frame++){
      const ready=await settle(new Promise<void>(resolve=>win.requestAnimationFrame(()=>resolve())));
      if(stop())return unknown(stop()!);
      if(!ready)return unknown('Preview animation frame did not settle.');
    }
  }
  if(!root.isConnected||doc.fonts.status!=='loaded')return unknown('Preview or fonts changed while settling.');
  const foreign=findPreviewText(root,key);
  if(!foreign)return unknown('Expected exactly one rendered source text object.');
  if(foreign.getAttribute('data-workflow-scope')!==(options.scope??'page-text'))return unknown('Text scope is not measurable.');
  const box=foreign.querySelector<HTMLElement>('[data-workflow-text-box]'),content=foreign.querySelector<HTMLElement>('[data-workflow-text-content]');
  if(!box||!content||!box.contains(content))return unknown('Text measurement instrumentation is missing.');
  const matrix=foreign.getScreenCTM();
  if(!matrix||![matrix.a,matrix.b,matrix.c,matrix.d].every(Number.isFinite)||matrix.a<=0||matrix.d<=0||Math.abs(matrix.b)>1e-6||Math.abs(matrix.c)>1e-6)return unknown('Rotated, reflected or unknown preview geometry.');
  const rect=box.getBoundingClientRect(),inner=content.getBoundingClientRect(),foreignRect=foreign.getBoundingClientRect();
  if(![rect.width,rect.height,inner.width,inner.height,foreignRect.width,foreignRect.height].every(Number.isFinite)||rect.width<=0||rect.height<=0||box.clientWidth<=0||box.clientHeight<=0)return unknown('Text geometry is not measurable.');
  const style=win.getComputedStyle(box);
  if(style.display==='none'||style.visibility!=='visible'||Number(style.opacity)===0)return unknown('Text is not visible.');
  const sx=matrix.a,sy=matrix.d;
  const left=Math.max(rect.left+parseFloat(style.paddingLeft||'0')*sx,foreignRect.left);
  const right=Math.min(rect.right-parseFloat(style.paddingRight||'0')*sx,foreignRect.right);
  const top=Math.max(rect.top+parseFloat(style.paddingTop||'0')*sy,foreignRect.top);
  const bottom=Math.min(rect.bottom-parseFloat(style.paddingBottom||'0')*sy,foreignRect.bottom);
  if(![left,right,top,bottom].every(Number.isFinite)||right<=left||bottom<=top)return unknown('Text content area is empty or unknown.');
  const range=doc.createRange();range.selectNodeContents(content);
  const textRects=Array.from(range.getClientRects());range.detach();
  if(content.textContent?.length&&!textRects.length)return unknown('Text layout bounds are unavailable.');
  const tolerance=.5;
  const textRangeOverflow=textRects.some(r=>r.left<left-tolerance||r.right>right+tolerance||r.top<top-tolerance||r.bottom>bottom+tolerance);
  const escaped=inner.left<left-tolerance||inner.right>right+tolerance||inner.top<top-tolerance||inner.bottom>bottom+tolerance;
  // The inner content has visible overflow; only its outer clipping box determines scroll clipping.
  const scrollOverflow=box.scrollWidth>box.clientWidth+1||box.scrollHeight>box.clientHeight+1;
  const contentScrollOverflow=content.scrollWidth>content.clientWidth+1||content.scrollHeight>content.clientHeight+1;
  const overlapKeys=options.checkOverlap&&!escaped&&!scrollOverflow?overlappingTextKeys(root,foreign,content):[];
  if(stop())return unknown(stop()!);
  if(doc.fonts.status!=='loaded')return unknown('Fonts changed during layout.');
  return {fits:!escaped&&!scrollOverflow&&!overlapKeys.length,reason:overlapKeys.length?'Text layout intersects neighboring text.':escaped?'Text bounds extend outside the visible content area.':scrollOverflow?'Text has scroll overflow.':textRangeOverflow?'Block layout fits; font range overhang requires visual review.':'Measured block layout and scroll extents fit this SVG sample.',
    width:(right-left)/sx,height:(bottom-top)/sy,contentWidth:Math.max(inner.width/sx,content.scrollWidth),contentHeight:Math.max(inner.height/sy,content.scrollHeight),
    scaleX:sx,scaleY:sy,scrollWidth:box.scrollWidth,scrollHeight:box.scrollHeight,clientWidth:box.clientWidth,clientHeight:box.clientHeight,
    boundsOverflow:escaped,scrollOverflow,overlapKeys,contentScrollOverflow,textRangeOverflow,warnings:textRangeOverflow?['font-range-overflow']:[],requiresVisualReview:true,fitKind:'block-layout-only',boundsKind:'DOM layout rectangles, not painted glyph pixels',fonts:'loaded',renderer:'slidelatch-svg',observedAt:new Date().toISOString()};
}
