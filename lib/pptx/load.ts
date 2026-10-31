import { readSourceSlides } from './xml';
import type { LoadedTemplate, RenderDeck, RenderElement } from './types';

export async function loadTemplate(bytes:ArrayBuffer):Promise<LoadedTemplate> {
  const started=performance.now();
  console.info('[SlideLatch] template.parse.start',{bytes:bytes.byteLength});
  try {
    const [{parse},slides]=await Promise.all([import('pptxtojson'),readSourceSlides(bytes)]);
    const deck=await parse(bytes,{imageMode:'base64',videoMode:'none',audioMode:'none'}) as unknown as RenderDeck;
    if(deck.slides.length!==slides.length)throw new Error('SLIDE_COUNT_MISMATCH');
    const warnings:string[]=[];
    deck.slides.forEach((slide,i)=>{
      const mapped=new Set<string>();
      const walk=(elements:RenderElement[])=>elements.forEach(el=>{if(el.id)mapped.add(String(el.id));if(el.elements)walk(el.elements)});
      walk(slide.elements);
      for(const node of slides[i].nodes)if(node.marked&&!mapped.has(node.id))warnings.push(`${slides[i].path}#${node.id}`);
    });
    if(warnings.length)console.warn('[SlideLatch] template.mapping.missing',{targets:warnings});
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    const sha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    console.info('[SlideLatch] template.parse.complete',{slides:slides.length,missing: warnings.length,durationMs:Math.round(performance.now()-started)});
    // Tracing hook: parse OOXML -> parser -> source mapping -> SVG should share a template session span.
    return {bytes,slides,deck,sha256,mappingWarnings:warnings};
  } catch(error) {
    console.error('[SlideLatch] template.parse.failed',error);
    throw error;
  }
}
