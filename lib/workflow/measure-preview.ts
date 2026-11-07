import type { TextMeasureEvidence } from './constraint-search.ts';

/** Measure only explicitly instrumented ordinary page text in this particular SVG. */
export async function measurePreviewText(root:SVGSVGElement,key:string,options:{signal?:AbortSignal;isCurrent?:()=>boolean}={}):Promise<TextMeasureEvidence>{
  const unknown=(reason:string):TextMeasureEvidence=>({fits:null,reason});
  const stop=()=>options.signal?.aborted?'cancelled':options.isCurrent&&!options.isCurrent()?'stale':null;
  if(stop())return unknown(stop()!);
  if(!root?.isConnected)return unknown('Preview root is not connected.');
  const doc=root.ownerDocument,win=doc.defaultView;
  if(!win||!doc.fonts)return unknown('Font readiness cannot be verified.');
  const settle=async(promise:Promise<unknown>)=>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{return await Promise.race([promise.then(()=>true),new Promise<boolean>(resolve=>{timer=setTimeout(()=>resolve(false),1500);})]);}
    finally{if(timer)clearTimeout(timer);}
  };
  if(stop())return unknown(stop()!);
  const fontsReady=await settle(doc.fonts.ready);
  if(stop())return unknown(stop()!);
  if(!fontsReady||doc.fonts.status!=='loaded')return unknown('Fonts did not settle.');
  for(let frame=0;frame<2;frame++){
    if(stop())return unknown(stop()!);
    const ready=await settle(new Promise<void>(resolve=>win.requestAnimationFrame(()=>resolve())));
    if(stop())return unknown(stop()!);
    if(!ready)return unknown('Preview animation frame did not settle.');
  }
  if(!root.isConnected||doc.fonts.status!=='loaded')return unknown('Preview or fonts changed while settling.');
  const matches=Array.from(root.querySelectorAll('foreignObject[data-workflow-node-key]')).filter(el=>el.getAttribute('data-workflow-node-key')===key);
  if(matches.length!==1)return unknown('Expected exactly one rendered source text object.');
  const foreign=matches[0] as SVGForeignObjectElement;
  if(foreign.getAttribute('data-workflow-scope')!=='page-text')return unknown('Only ungrouped, unrotated, non-list page text is supported.');
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
  if(stop())return unknown(stop()!);
  return {fits:!escaped&&!scrollOverflow,reason:escaped?'Text bounds extend outside the visible content area.':scrollOverflow?'Text has scroll overflow.':textRangeOverflow?'Block layout fits; font range overhang requires visual review.':'Measured block layout and scroll extents fit this SVG sample.',
    width:(right-left)/sx,height:(bottom-top)/sy,contentWidth:Math.max(inner.width/sx,content.scrollWidth),contentHeight:Math.max(inner.height/sy,content.scrollHeight),
    scaleX:sx,scaleY:sy,scrollWidth:box.scrollWidth,scrollHeight:box.scrollHeight,clientWidth:box.clientWidth,clientHeight:box.clientHeight,
    boundsOverflow:escaped,scrollOverflow,contentScrollOverflow,textRangeOverflow,requiresVisualReview:true,fitKind:'block-layout-only',boundsKind:'DOM layout rectangles, not painted glyph pixels',fonts:'loaded',renderer:'slidelatch-svg',observedAt:new Date().toISOString()};
}
