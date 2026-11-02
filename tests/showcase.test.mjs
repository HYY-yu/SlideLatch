import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DOMParser} from '@xmldom/xmldom';
import JSZip from 'jszip';
import path from 'node:path';
import {readSourceSlides} from '../lib/pptx/xml.ts';
globalThis.DOMParser=DOMParser;
for (const locale of ['zh','en']) {
const suffix=locale==='en'?'.en':'';
const dir=locale==='en'?'en/':'';
const metadata=JSON.parse(readFileSync(new URL(`../lib/demo/showcase${suffix}.json`,import.meta.url)));
const content=JSON.parse(readFileSync(new URL(`../docs/examples/showcase/content${suffix}.json`,import.meta.url)));
const template=readFileSync(new URL(`../public/demo/minimal-business/${dir}minimal-business-original.pptx`,import.meta.url));
const templateZip=await JSZip.loadAsync(template);
const digest=data=>createHash('sha256').update(data).digest('hex');
test(`${locale}: static comparisons are real template-generated decks with different groups, images and editable chart workbooks`,async()=>{
 assert.equal(digest(template),metadata.templateSha256);
 for(const [i,version]of metadata.versions.entries()){
  const c=content.cases[i],bytes=readFileSync(new URL(`../public/demo/showcase/${dir}${version.id}.pptx`,import.meta.url));
  assert.equal(digest(bytes),version.sha256);
  const slides=await readSourceSlides(bytes);assert.equal(slides.length,10);
  assert.ok(slides[0].nodes.some(n=>n.text===c.cover[1]));
  assert.equal(slides[4].nodes.filter(n=>n.kind==='grpSp'&&!n.parentId).length,c.items.length);
  const zip=await JSZip.loadAsync(bytes),names=Object.keys(zip.files);
  assert.ok(!names.some(n=>n.startsWith('ppt/notesSlides/')));
  const media=await Promise.all(names.filter(n=>n.startsWith('ppt/media/')&&!zip.files[n].dir).map(n=>zip.file(n).async('uint8array')));
  const expectedPhoto=await templateZip.file(`ppt/media/image${c.photo}.jpeg`).async('uint8array');
  assert.ok(media.some(data=>digest(data)===digest(expectedPhoto)));
  const resolveRelationship=async(owner,id)=>{
   const relPath=path.posix.join(path.posix.dirname(owner),'_rels',path.posix.basename(owner)+'.rels');
   const doc=new DOMParser().parseFromString(await zip.file(relPath).async('string'),'application/xml');
   const rel=Array.from(doc.getElementsByTagName('Relationship')).find(el=>el.getAttribute('Id')===id);assert.ok(rel);
   return path.posix.normalize(path.posix.join(path.posix.dirname(owner),rel.getAttribute('Target')));
  };
  const slideXml=new DOMParser().parseFromString(await zip.file(slides[8].path).async('string'),'application/xml');
  const chartRef=slideXml.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/chart','chart')[0];assert.ok(chartRef);
  const chartName=await resolveRelationship(slides[8].path,chartRef.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'));
  const chart=await zip.file(chartName).async('string');
  const chartDoc=new DOMParser().parseFromString(chart,'application/xml');
  const cached=Array.from(chartDoc.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/chart','numCache')).flatMap(cache=>Array.from(cache.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/chart','v')).map(v=>Number(v.textContent)));
  assert.deepEqual(cached,c.chart.series[0].values);
  const dataRef=chartDoc.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/chart','externalData')[0];assert.ok(dataRef);
  const workbookName=await resolveRelationship(chartName,dataRef.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'));
  const workbook=await JSZip.loadAsync(await zip.file(workbookName).async('uint8array'));
  const sheet=await workbook.file('xl/worksheets/sheet1.xml').async('string');
  for(const v of c.chart.series[0].values)assert.ok(sheet.includes(`>${v}<`));
  for(const category of metadata.categories){const image=readFileSync(new URL(`../public/demo/showcase/${dir}${version.id}-${category.id}.jpg`,import.meta.url));assert.ok(image.length>10000);assert.equal(image.readUInt16BE(0),0xffd8);}
 }
});

}
