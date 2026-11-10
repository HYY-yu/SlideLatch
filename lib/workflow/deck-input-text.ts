import type { DeckInput, DeckInputSlide } from '../../packages/ppt-dsl/src/types.ts';

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function textFields(value: unknown): Record<string,string> {
  if (!record(value) || Object.values(value).some(item => typeof item !== 'string' || item.length > 20000)) throw new Error('CONTENT_FIELDS_INVALID');
  return Object.fromEntries(Object.entries(value).map(([key,item]) => [key,String(item)]));
}
export function parseStudioContent(text: string): DeckInput {
  if (text.length > 8*1024*1024) throw new Error('CONTENT_SIZE_LIMIT');
  const value: unknown = JSON.parse(text);
  if (!record(value) || !Array.isArray(value.slides) || !value.slides.length || value.slides.length > 200 || Object.keys(value).some(key=>!['title','slides'].includes(key)) || value.title !== undefined && typeof value.title !== 'string') throw new Error('CONTENT_DECK_INVALID');
  const slides: DeckInputSlide[] = value.slides.map(entry => {
    if (!record(entry) || typeof entry.templateId !== 'string' || Object.keys(entry).some(key=>!['templateId','nodes','lists'].includes(key))) throw new Error('CONTENT_SLIDE_INVALID');
    const listEntries: Array<[string,Record<string,string>[]]> = [];
    if (entry.lists !== undefined) {
      if (!record(entry.lists)) throw new Error('CONTENT_LIST_INVALID');
      for (const [key,items] of Object.entries(entry.lists)) {
        if (!Array.isArray(items) || items.length > 1000) throw new Error('CONTENT_LIST_INVALID');
        listEntries.push([key,items.map(textFields)]);
      }
    }
    return {templateId:entry.templateId,nodes:entry.nodes===undefined?{}:textFields(entry.nodes),lists:Object.fromEntries(listEntries)};
  });
  return {title:typeof value.title==='string'?value.title:undefined,slides};
}
