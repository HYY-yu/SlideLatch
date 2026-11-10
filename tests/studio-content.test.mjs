import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStudioContent} from '../lib/workflow/deck-input-text.ts';

test('Studio content JSON preserves page order, repeated templates, text and list items',()=>{
  const content={title:'季度复盘',slides:[{templateId:'cover',nodes:{title:'业务复盘'}},{templateId:'content',lists:{list_1:[{text_1:'收入'},{text_1:'利润'}]}},{templateId:'content',nodes:{text_1:'Next period'}}]};
  const parsed=parseStudioContent(JSON.stringify(content));
  assert.equal(parsed.title,content.title);
  assert.deepEqual(parsed.slides.map(slide=>slide.templateId),['cover','content','content']);
  assert.deepEqual(parsed.slides[1].lists.list_1,[{text_1:'收入'},{text_1:'利润'}]);
  assert.equal(parsed.slides[2].nodes.text_1,'Next period');
});
for(const value of [null,{slides:[]},{slides:[null]},{slides:[{templateId:'x',nodes:{text:17}}]},{slides:[{templateId:'x',lists:{list_1:{}}}]},{slides:[{templateId:'x',nodes:{image:{path:'/private/file'}}}]},{slides:[{templateId:'x',nodes:{text:'x'.repeat(20001)}}]},{slides:[{templateId:'x'}],palette:{}},{slides:[{templateId:'x',script:'evil'}]}])test(`Studio rejects malformed or unsupported content ${JSON.stringify(value).slice(0,65)}`,()=>assert.throws(()=>parseStudioContent(JSON.stringify(value)),/CONTENT_/));
test('Studio caps page count and serialized content size',()=>{
  assert.throws(()=>parseStudioContent(JSON.stringify({slides:Array.from({length:201},()=>({templateId:'x'}))})),/CONTENT_DECK_INVALID/);
  assert.throws(()=>parseStudioContent(' '.repeat(8*1024*1024+1)),/CONTENT_SIZE_LIMIT/);
});

const {locateAuthorIssue}=await import('../lib/workflow/studio-issue.ts');
test('author issues locate exact source object across pages',()=>{
  const slides=[{path:'ppt/slides/slide1.xml',nodes:[{id:'2',key:'ppt/slides/slide1.xml#2'}]},{path:'ppt/slides/slide2.xml',nodes:[{id:'2',key:'ppt/slides/slide2.xml#2'}]}];
  assert.deepEqual(locateAuthorIssue(slides,'2 / 2: MARK_TYPE_MISMATCH'),{page:1,key:'ppt/slides/slide2.xml#2'});
  assert.deepEqual(locateAuthorIssue(slides,'Unmapped ppt/slides/slide1.xml#2'),{page:0,key:'ppt/slides/slide1.xml#2'});
  assert.equal(locateAuthorIssue(slides,'99 / 2: INVALID'),null);
});
