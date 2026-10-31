const tags=new Set(['p','span','br','b','strong','em','i','u','s','sub','sup','ol','ul','li']);
const properties=new Set(['color','font-family','font-size','font-weight','font-style','line-height','text-align','margin-left','margin-right','margin-top','margin-bottom','text-indent','text-decoration','letter-spacing','vertical-align','padding-left','list-style-type']);
/** The parser emits HTML. Rebuild an allowlisted fragment; never attach original HTML or events. */
export function safeRichText(html:string,fontScale=1,preview?:string):string {
  const doc=new DOMParser().parseFromString(html,'text/html');
  const clean=(node:Node):Node=>{
    if(node.nodeType===3)return doc.createTextNode(node.textContent||'');
    if(node.nodeType!==1)return doc.createTextNode('');
    const source=node as HTMLElement;
    if(['SCRIPT','STYLE','IFRAME','OBJECT','IMG','LINK'].includes(source.tagName))return doc.createTextNode('');
    const target=doc.createElement(tags.has(source.localName)?source.localName:'span');
    for(const property of Array.from(source.style)){
      if(!properties.has(property))continue;
      let value=source.style.getPropertyValue(property);
      if(/url\(|expression|javascript|[<>]/i.test(value))continue;
      value=value.replace(/(-?[\d.]+)pt/g,(_,v)=>`${Number(v)}px`);
      if(property==='font-size'&&fontScale!==1)value=value.replace(/([\d.]+)px/,(_,v)=>`${Number(v)*fontScale}px`);
      target.style.setProperty(property,value);
    }
    if(source.localName==='p'){
      target.style.marginTop=target.style.marginTop||'0';
      target.style.marginBottom=target.style.marginBottom||'0';
    }
    source.childNodes.forEach(child=>target.appendChild(clean(child)));
    return target;
  };
  const wrapper=doc.createElement('div');doc.body.childNodes.forEach(node=>wrapper.appendChild(clean(node)));
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
