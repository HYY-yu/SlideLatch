import type { TextOutline, TextOutlineParagraph } from './text-outline';

const tags=new Set(['p','span','br','b','strong','em','i','u','s','sub','sup','ol','ul','li']);
const properties=new Set(['color','font-family','font-size','font-weight','font-style','line-height','text-align','margin-left','margin-right','margin-top','margin-bottom','text-indent','text-decoration','letter-spacing','vertical-align','padding-left','list-style-type']);
const degree = '-?\\d+(?:\\.\\d+)?deg';
const color = '(?:#[\\da-f]{3,8}|rgba?\\([\\d.,%\\s/]+\\))';
const stop = `${color}\\s*(?:-?\\d+(?:\\.\\d+)?%)?`;
const textGradient = new RegExp(`^linear-gradient\\(\\s*(?:${degree}\\s*,\\s*)?${stop}(?:\\s*,\\s*${stop})+\\s*\\)$`, 'i');

export function isTextGradient(image: string): boolean {
  return image.length <= 4096 && textGradient.test(image);
}

function applyOutline(run: HTMLElement, outline: TextOutline) {
  run.style.setProperty('-webkit-text-stroke', `${outline.width}px ${outline.color}`);
  if (outline.removeFill) {
    run.style.backgroundImage = 'none';
    run.style.color = 'transparent';
    if (outline.mask) run.style.maskImage = outline.mask;
  }
}

function applyParagraphOutline(paragraph: HTMLParagraphElement, source: TextOutlineParagraph) {
  const runs = source.runs.flatMap(run => run.text ? [{
    ...run,
    text: run.text.replace(/\t/g, '    ').replace(/\s/g, ' '),
  }] : []);
  const normalized = (text: string) => text.replace(/\s/g, ' ');
  if (normalized(paragraph.textContent ?? '') !== runs.map(run => run.text).join('')) return;
  let runIndex = 0, runOffset = 0;
  for (const span of Array.from(paragraph.children)) {
    if (span.tagName !== 'SPAN') continue;
    const text = span.textContent ?? '';
    const segments: HTMLElement[] = [];
    let offset = 0;
    while (offset < text.length && runIndex < runs.length) {
      const run = runs[runIndex];
      const length = Math.min(text.length - offset, run.text.length - runOffset);
      if (offset === 0 && length === text.length) {
        if (run.outline && span instanceof HTMLElement) applyOutline(span, run.outline);
        offset += length;
      } else {
        const segment = paragraph.ownerDocument.createElement('span');
        segment.setAttribute('style', span.getAttribute('style') ?? '');
        segment.textContent = text.slice(offset, offset + length);
        if (run.outline) applyOutline(segment, run.outline);
        segments.push(segment);
        offset += length;
      }
      runOffset += length;
      if (runOffset === run.text.length) {
        runIndex++;
        runOffset = 0;
      }
    }
    if (segments.length) span.replaceWith(...segments);
  }
}

/** The parser emits HTML. Rebuild an allowlisted fragment; never attach original HTML or events. */
export function safeRichText(html:string,fontScale=1,preview?:string,outlines?:TextOutlineParagraph[]):string {
  const doc=new DOMParser().parseFromString(html,'text/html');
  const clean=(node:Node):Node=>{
    if(node.nodeType===3)return doc.createTextNode(node.textContent||'');
    if(node.nodeType!==1)return doc.createTextNode('');
    const source=node as HTMLElement;
    if(['SCRIPT','STYLE','IFRAME','OBJECT','IMG','LINK'].includes(source.tagName))return doc.createTextNode('');
    const target=doc.createElement(tags.has(source.localName)?source.localName:'span');
    const expectsGradient=source.style.getPropertyValue('background-clip')==='text';
    const gradient=source.style.getPropertyValue('background-image');
    const hasTextGradient=isTextGradient(gradient);
    for(const property of Array.from(source.style)){
      if(!properties.has(property))continue;
      let value=source.style.getPropertyValue(property);
      if(/url\(|expression|javascript|[<>]/i.test(value))continue;
      if(property==='color'&&value==='transparent'&&(expectsGradient||hasTextGradient))continue;
      value=value.replace(/(-?[\d.]+)pt/g,(_,v)=>`${Number(v)}px`);
      if(property==='font-size'&&fontScale!==1)value=value.replace(/([\d.]+)px/,(_,v)=>`${Number(v)*fontScale}px`);
      target.style.setProperty(property,value);
    }
    if(expectsGradient&&hasTextGradient){
      target.style.backgroundImage=gradient;
      target.style.backgroundClip='text';
      target.style.color='transparent';
    }
    if(source.localName==='p'){
      target.style.marginTop=target.style.marginTop||'0';
      target.style.marginBottom=target.style.marginBottom||'0';
    }
    source.childNodes.forEach(child=>target.appendChild(clean(child)));
    return target;
  };
  const wrapper=doc.createElement('div');doc.body.childNodes.forEach(node=>wrapper.appendChild(clean(node)));
  if(outlines?.length){
    const paragraphs=wrapper.querySelectorAll('p');
    for(const outline of outlines){
      const paragraph=paragraphs[outline.index];
      if(paragraph)applyParagraphOutline(paragraph,outline);
    }
  }
  if(preview!==undefined){
    // Keep the original first run's formatting; preview content never enters the PPTX patch model.
    const first=wrapper.querySelector('span')||wrapper.querySelector('p')||wrapper;
    const run=first.cloneNode(false) as HTMLElement;
    run.textContent=preview;
    run.style.whiteSpace='pre-wrap';
    const paragraph=wrapper.querySelector('p')?.cloneNode(false) as HTMLElement|undefined;
    wrapper.replaceChildren();
    if(paragraph&&first.localName!=='p'){paragraph.appendChild(run);wrapper.appendChild(paragraph);}
    else wrapper.appendChild(run);
  }
  return wrapper.innerHTML;
}
