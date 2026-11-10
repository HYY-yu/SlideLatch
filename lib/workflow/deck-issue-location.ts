import {validateBrowserDeck,type BrowserTemplate,type DeckInput} from './browser-deck.ts';

export async function locateDeckIssue(template:BrowserTemplate,input:DeckInput,issue:string,currentIndex:number):Promise<{slideIndex:number;key:string|null}|null>{
  const indexed=/slides\[(\d+)\]/.exec(issue);
  const tokens=issue.split(/[^A-Za-z_0-9]+/);
  const candidates=input.slides.flatMap((slide,index)=>tokens.includes(slide.templateId)?[index]:[]);
  let slideIndex:number|undefined=indexed?Number(indexed[1]):candidates[0];
  if(!indexed&&candidates.length>1){
    const ordered=candidates.includes(currentIndex)?[currentIndex,...candidates.filter(index=>index!==currentIndex)]:candidates;
    slideIndex=undefined;
    for(const index of ordered){
      const errors=await validateBrowserDeck(template,{slides:[input.slides[index]]});
      if(errors.includes(issue)){slideIndex=index;break;}
    }
  }
  if(slideIndex===undefined)return null;
  const entry=input.slides[slideIndex],page=template.slides.find(slide=>slide.templateId===entry?.templateId);
  if(!page)return null;
  const list=page.lists.find(list=>tokens.includes(list.key));
  const item=/\[(\d+)\]/.exec(issue.replace(/slides\[\d+\]/,''));
  const component=list?
    list.items.filter((_,index)=>!item||index===Number(item[1])).flatMap(row=>row.components).find(node=>tokens.includes(node.key)):
    page.nodes.find(node=>tokens.includes(node.key));
  return {slideIndex,key:component?`${page.slidePath}#${component.locator.shapeId}`:null};
}
