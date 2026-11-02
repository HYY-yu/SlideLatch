import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DOMParser} from '@xmldom/xmldom';
import {readSourceSlides} from '../lib/pptx/xml.ts';
globalThis.DOMParser=DOMParser;
const read=p=>readFileSync(new URL(p,import.meta.url));
test('English template preserves all 33 pages, node identities, DSL and geometry while translating visible content',async()=>{
 const zh=read('../public/demo/minimal-business/minimal-business-original.pptx');
 const en=read('../public/demo/minimal-business/en/minimal-business-original.pptx');
 const mapping=JSON.parse(read('../docs/examples/english-template-map.json'));
 const metadata=JSON.parse(read('../lib/demo/template.en.json'));
 const hash=b=>createHash('sha256').update(b).digest('hex');
 assert.equal(hash(zh),mapping.sourceSha256);assert.equal(hash(en),metadata.sha256);
 const [a,b]=await Promise.all([readSourceSlides(zh),readSourceSlides(en)]);
 assert.equal(b.length,33);
 const structure=slides=>slides.map(s=>({...s,nodes:s.nodes.map(({text,...n})=>n)}));
 assert.deepEqual(structure(a),structure(b));
 for(const slide of b) for(const node of slide.nodes){
  assert.ok(!/\p{Script=Han}/u.test(node.text),`${node.key}: untranslated visible text`);
  const translated=mapping.nodes[`${slide.path}#${node.id}`];
  if(!translated)continue;
  assert.equal(node.text.trim(),translated.english);
  if(translated.range){const length=Array.from(node.text.trim()).length;assert.ok(length>=translated.range.min&&length<=translated.range.max,`${node.key}: outside existing DSL range`);}
 }
});
