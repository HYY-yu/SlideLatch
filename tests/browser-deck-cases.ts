import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import {DOMParser, XMLSerializer} from '@xmldom/xmldom';
import {loadBrowserTemplate, createBrowserSlideInput, createBrowserDeckInput, selectBrowserCandidates, validateBrowserDeck, generateBrowserDeck} from '../lib/workflow/browser-deck.ts';
import {assertBrowserPackageBudget} from '../lib/workflow/browser-package-budget.ts';
import {inspectWorkspace,applyMarkProposal,sha256Bytes} from '../lib/workflow/session.ts';
import {verifyDeckPackage} from '../packages/ppt-dsl/src/pptx/verify.ts';
import {readSourceSlides,writePptx, NS, child} from '../lib/pptx/xml.ts';
import {selectCandidates} from '../packages/ppt-dsl/src/select.ts';
import {validateDeckContent as cliValidateContent} from '../packages/ppt-dsl/src/validation.ts';
import {relationshipPartForOwner, ownerPartForRelationshipPart, resolveRelationshipTarget} from '../packages/ppt-dsl/src/pptx/relationships.ts';
Object.assign(globalThis,{DOMParser,XMLSerializer});
const file=new URL('../public/demo/minimal-business/minimal-business-original.pptx',import.meta.url);
const original=await readFile(file);
const sourceZip=await JSZip.loadAsync(original);
const template=await loadBrowserTemplate(original);
const baseline=createBrowserDeckInput(template);
const doc=(text:string)=>new DOMParser().parseFromString(text,'application/xml');
const serialized=(node:unknown)=>node?new XMLSerializer().serializeToString(node as Parameters<XMLSerializer['serializeToString']>[0]):undefined;
const shape=(document:Document,id:string)=>Array.from(document.getElementsByTagNameNS(NS.p,'cNvPr')).find(p=>p.getAttribute('id')===id)?.parentNode?.parentNode as Element;

test('same runtime analyzer contracts, fingerprint and matching lock; imports never trust forged JSON',async()=>{
 assert.equal(template.slides.length,33);assert.equal(template.manifest.templateSha256,template.sourceSha256);
 assert.ok(Object.isFrozen(template.manifest.slides[0].nodes));
 assert.deepEqual(await validateBrowserDeck(template,baseline),[]);
 const lock={manifestVersion:2,templateSha256:template.sourceSha256};
 const loaded=await loadBrowserTemplate(original,{manifest:template.manifest,lock});assert.equal(loaded.sourceSha256,template.sourceSha256);
 await assert.rejects(loadBrowserTemplate(original,{manifest:{...template.manifest,templateSha256:'0'.repeat(64)}}),/MANIFEST_FINGERPRINT/);
 await assert.rejects(loadBrowserTemplate(original,{manifest:template.manifest,lock:{...lock,templateSha256:'0'.repeat(64)}}),/LOCK_FINGERPRINT/);
 await assert.rejects(loadBrowserTemplate(original,{lock}),/LOCK_FINGERPRINT/);
 const forged=structuredClone(template.manifest);forged.slides[0].nodes[0].length!.max=10000;
 await assert.rejects(loadBrowserTemplate(original,{manifest:forged}),/MANIFEST_CONTRACT_MISMATCH/);
 await assert.rejects(validateBrowserDeck({...template},baseline),/TEMPLATE_HANDLE/);
});

test('deterministic selector and shared validator preserve CLI content semantics',async()=>{
 const request={pageType:'内容页' as const,availableAssetKinds:['image','background','icon'] as const};
 const query={...request,availableAssetKinds:[...request.availableAssetKinds]};
 assert.deepEqual(selectBrowserCandidates(template,query).map(s=>s.templateId),selectCandidates(template.manifest,query).filter(s => ![...s.nodes,...s.lists.flatMap(l=>l.items.flatMap(i=>i.components))].some(c=>['table','chart'].includes(c.kind))).map(s=>s.templateId));
 assert.equal(selectBrowserCandidates(template,{pageType:'目录页',availableAssetKinds:[],listCounts:{list_1:3}}).length,0);
 const invalid=structuredClone(baseline);invalid.slides[0].nodes!.text_1='A';
 assert.deepEqual(await validateBrowserDeck(template,invalid),await cliValidateContent(template.manifest,invalid));
 const short={slides:[createBrowserSlideInput(template,'slide_001')]};assert.match((await validateBrowserDeck(template,short)).join('\n'),/章节数量必须在 3-6/);
});

test('independent repeated clones fill native text, numbers and list fields; source geometry, styles and assets survive',async()=>{
 const input=structuredClone(baseline);input.title='Browser reuse test';
 input.slides[0].nodes!.text_1='甲&乙<丙>🚀';
 input.slides[2].nodes!.text_1='第一章节';input.slides[4].nodes!.text_1='第二章节';
 input.slides[3].lists!.list_1[0].text_1='测试标题';
 const generated=await generateBrowserDeck(template,input);
 assert.equal(generated.report.runtimePackageValidation,'passed');assert.equal(generated.report.nativeOfficeValidation,'not_run');assert.equal(generated.report.visualGuarantee,false);
 const zip=await JSZip.loadAsync(generated.bytes);
 assert.deepEqual((await verifyDeckPackage(zip)).errors,[]);
 const slides=await readSourceSlides(generated.bytes),sourceSlides=await readSourceSlides(original);
 assert.equal(slides.length,13);assert.equal(new Set(slides.map(s=>s.path)).size,13);
 for(const [i,entry]of input.slides.entries()){
  const contract=template.slides.find(s=>s.templateId===entry.templateId)!;
  const src=sourceSlides.find(s=>s.path===contract.slidePath)!;
  const sourceDoc=doc(await sourceZip.file(contract.slidePath)!.async('string')) as unknown as Document;
  const outputDoc=doc(await zip.file(slides[i].path)!.async('string')) as unknown as Document;
  assert.deepEqual(slides[i].nodes.map(n=>[n.id,n.box,n.childBox,n.rotation,n.flipH,n.flipV,n.parentId]),src.nodes.map(n=>[n.id,n.box,n.childBox,n.rotation,n.flipH,n.flipV,n.parentId]));
  for(const sourceNode of src.nodes){
   const a=shape(sourceDoc,sourceNode.id),b=shape(outputDoc,sourceNode.id);
   assert.equal(serialized(child(a,'spPr')),serialized(child(b,'spPr')));
   assert.equal(serialized(child(a,'grpSpPr')),serialized(child(b,'grpSpPr')));
   if(!sourceNode.marked&&sourceNode.kind!=='grpSp'&&sourceNode.name!=='runtime-page-number')assert.equal(serialized(child(a,'txBody')),serialized(child(b,'txBody')));
  }
  for(const component of contract.nodes.filter(c=>c.kind==='text')){
   assert.equal(slides[i].nodes.find(n=>n.id===component.locator.shapeId)!.text,entry.nodes![component.key]);
   const a=shape(sourceDoc,component.locator.shapeId),b=shape(outputDoc,component.locator.shapeId);
   assert.equal(serialized(a.getElementsByTagNameNS(NS.a,'rPr')[0]),serialized(b.getElementsByTagNameNS(NS.a,'rPr')[0]));
   assert.equal(serialized(child(a,'txBody')&&child(child(a,'txBody')!,'bodyPr')),serialized(child(b,'txBody')&&child(child(b,'txBody')!,'bodyPr')));
  }
 }
 const numberId=template.slides.find(s=>s.templateId==='slide_005')!.nodes.find(n=>n.kind==='number')!.locator.shapeId;
 assert.equal(slides[2].nodes.find(n=>n.id===numberId)!.text,'01');assert.equal(slides[4].nodes.find(n=>n.id===numberId)!.text,'02');
 const listId=template.slides.find(s=>s.templateId==='slide_007')!.lists[0].items[0].components.find(c=>c.key==='text_1')!.locator.shapeId;
 assert.equal(slides[3].nodes.find(n=>n.id===listId)!.text,'测试标题');
 assert.notEqual(slides[5].nodes.find(n=>n.id===listId)!.text,'测试标题');
 assert.ok(!Object.keys(zip.files).some(p=>!zip.files[p].dir&&/ppt\/notesSlides\//.test(p)));
 assert.ok(!Object.keys(zip.files).some(p=>sourceSlides.some(s=>s.path===p)));
 const retained=Object.keys(zip.files).filter(p=>!zip.files[p].dir&&/ppt\/(media|theme|slideMasters|slideLayouts)\//.test(p));assert.ok(retained.length>3);assert.ok(retained.some(p=>p.startsWith('ppt/media/')));
 for(const p of retained)assert.deepEqual(await zip.file(p)!.async('uint8array'),await sourceZip.file(p)!.async('uint8array'),`unchanged package part ${p}`);
 const again=await JSZip.loadAsync((await generateBrowserDeck(template,input)).bytes);
 assert.deepEqual(Object.keys(again.files).sort(),Object.keys(zip.files).sort());
 for(const p of Object.keys(zip.files).filter(p=>!zip.files[p].dir))assert.deepEqual(await again.file(p)!.async('uint8array'),await zip.file(p)!.async('uint8array'),`repeat stable ${p}`);
 assert.deepEqual(await readFile(file),original);
});

test('unsupported values, dynamic resizing and malformed inputs fail closed',async()=>{
 for(const value of [null,[],{}, {slides:'bad'}, {slides:[null]}, {slides:[{templateId:'slide_001',lists:{a:[null]}}]}, {...baseline,palette:{}}]){
  const errors=await validateBrowserDeck(template,value as never);assert.ok(errors.length);
  await assert.rejects(generateBrowserDeck(template,value as never),/BROWSER_DECK_INVALID/);
 }
 const resize=structuredClone(baseline);resize.slides[1].lists!.list_1.pop();assert.match((await validateBrowserDeck(template,resize)).join('\n'),/UNSUPPORTED_LIST_RESIZE/);
 for(const invalid of [{path:'/tmp/image.png'},12,{paragraphs:[]},'bad\u0001', '\ud800']){
  const input=structuredClone(baseline);input.slides[0].nodes!.text_1=invalid as never;assert.ok((await validateBrowserDeck(template,input)).length);
 }
 const replacement=structuredClone(baseline);replacement.slides[0].nodes!.image_1='/image.png';assert.match((await validateBrowserDeck(template,replacement)).join('\n'),/不允许字段/);
 const number=structuredClone(baseline);number.slides[2].nodes!.number_1=99;assert.match((await validateBrowserDeck(template,number)).join('\n'),/numbers are bound automatically/);
});

test('source and input snapshots cannot be altered during or after async calls',async()=>{
 const bytes=new Uint8Array(original);const loading=loadBrowserTemplate(bytes);bytes.fill(0);const loaded=await loading;
 const input=createBrowserDeckInput(loaded);const generation=generateBrowserDeck(loaded,input);input.slides.length=0;
 assert.equal((await generation).report.slideCount,13);
});

test('XML entities, dangling links, unsafe targets, macro packages and external media are rejected',async()=>{
 const mutated=async(path:string,change:(s:string)=>string)=>{const zip=await JSZip.loadAsync(original);zip.file(path,change(await zip.file(path)!.async('string')));return zip.generateAsync({type:'uint8array'});};
 await assert.rejects(loadBrowserTemplate(await mutated('ppt/presentation.xml',s=>'<!DOCTYPE foo [<!ENTITY attack "bad">]>'+s)),/XML_UNSAFE/);
 await assert.rejects(loadBrowserTemplate(await mutated('ppt/_rels/presentation.xml.rels',s=>s.replace('slides/slide1.xml','slides/missing.xml'))),/DANGLING_RELATION/);
 await assert.rejects(loadBrowserTemplate(await mutated('ppt/_rels/presentation.xml.rels',s=>s.replace('slides/slide1.xml','../../outside.xml'))),/PART_TARGET/);
 await assert.rejects(loadBrowserTemplate(await mutated('ppt/_rels/presentation.xml.rels',s=>s.replace('Target="slides/slide1.xml"','Target="https://example.test/image.png" TargetMode="External"'))),/UNSUPPORTED_EXTERNAL_ASSET/);
 await assert.rejects(loadBrowserTemplate(await mutated('[Content_Types].xml',s=>s.replace('application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml','application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml'))),/UNSUPPORTED_MACROS/);
 const custom=await loadBrowserTemplate(await mutated('ppt/presentation.xml',s=>s.replace('</p:presentation>','<p:custShowLst/></p:presentation>')));
 await assert.rejects(generateBrowserDeck(custom,createBrowserDeckInput(custom)),/UNSUPPORTED_PRESENTATION/);
});

test('OPC path helpers retain Node POSIX semantics for valid package paths',()=>{
 const paths=['ppt/slides/slide1.xml','ppt/media/image.png','ppt/charts/chart1.xml','root.xml'];
 for(const p of paths){assert.equal(relationshipPartForOwner(p),path.posix.join(path.posix.dirname(p),'_rels',`${path.posix.basename(p)}.rels`));assert.equal(ownerPartForRelationshipPart(relationshipPartForOwner(p)),p);}
 for(const owner of [undefined,...paths])for(const target of ['../media/image.png','./slide2.xml','../../docProps/core.xml','/ppt/theme/theme1.xml','theme/../theme/theme1.xml'])assert.equal(resolveRelationshipTarget(owner,target),target.startsWith('/')?target.replace(/^\/+/, ''):path.posix.normalize(path.posix.join(owner?path.posix.dirname(owner):'',target)));
});

test('browser engine dependency graph has no filesystem, path, crypto or server runtime imports',()=>{
 const root=path.resolve('lib/workflow/browser-deck.ts'),seen=new Set<string>();
 const visit=(file:string)=>{
  if(seen.has(file))return;seen.add(file);const source=readFileSync(file,'utf8');
  for(const match of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)){
   assert.ok(!match[1].startsWith('node:'),`${file} imports ${match[1]}`);
   if(!match[1].startsWith('.'))continue;
   const base=path.resolve(path.dirname(file),match[1]);const resolved=[base,base.replace(/\.js$/,'.ts'),`${base}.ts`].find(existsSync);if(resolved)visit(resolved);
  }
 };visit(root);assert.ok(seen.size>15);
});

test('mixed source run or paragraph formatting is never flattened; unchanged mixed text and uniform split runs remain reusable',async()=>{
 const component=template.slides[0].nodes.find(c=>c.kind==='text')!;
 for(const mode of ['mixed-runs','mixed-paragraphs','same-runs'] as const){
  const zip=await JSZip.loadAsync(original);
  const document=doc(await zip.file(template.slides[0].slidePath)!.async('string')) as unknown as Document;
  const sourceShape=shape(document,component.locator.shapeId),body=child(sourceShape,'txBody')!,paragraph=child(body,'p')!;
  const firstRun=child(paragraph,'r')!,secondRun=firstRun.cloneNode(true) as Element;
  const text=firstRun.getElementsByTagNameNS(NS.a,'t')[0].textContent!;
  firstRun.getElementsByTagNameNS(NS.a,'t')[0].textContent=text.slice(0,2);secondRun.getElementsByTagNameNS(NS.a,'t')[0].textContent=text.slice(2);
  if(mode==='mixed-paragraphs'){
   const next=paragraph.cloneNode(false) as Element,pPr=document.createElementNS(NS.a,'a:pPr');pPr.setAttribute('algn',child(paragraph,'pPr')?.getAttribute('algn')==='r'?'l':'r');next.appendChild(pPr);next.appendChild(secondRun);body.appendChild(next);
  }else{
   if(mode==='mixed-runs')child(secondRun,'rPr')!.setAttribute('b',child(firstRun,'rPr')!.getAttribute('b')==='1'?'0':'1');
   paragraph.insertBefore(secondRun,firstRun.nextSibling);
  }
  zip.file(template.slides[0].slidePath,serialized(document)!);
  const bytes=await zip.generateAsync({type:'uint8array'}),loaded=await loadBrowserTemplate(bytes);
  const input=createBrowserDeckInput(loaded);
  const sourceNodes=await readSourceSlides(bytes);assert.equal(input.slides[0].nodes![component.key],sourceNodes[0].nodes.find(n=>n.id===component.locator.shapeId)!.text);
  assert.deepEqual(await validateBrowserDeck(loaded,input),[]);
  const generated=await generateBrowserDeck(loaded,input),output=await JSZip.loadAsync(generated.bytes),paths=await readSourceSlides(generated.bytes);
  const outputDoc=doc(await output.file(paths[0].path)!.async('string')) as unknown as Document;
  assert.equal(serialized(child(shape(outputDoc,component.locator.shapeId),'txBody')),serialized(body));
  input.slides[0].nodes![component.key]='新版文本';
  const errors=await validateBrowserDeck(loaded,input);
  if(mode==='same-runs'){assert.deepEqual(errors,[]);await generateBrowserDeck(loaded,input);}
  else {assert.match(errors.join('\n'),/UNSUPPORTED_TEXT_FORMATTING/);await assert.rejects(generateBrowserDeck(loaded,input),/UNSUPPORTED_TEXT_FORMATTING/);}
 }
});

test('leading empty paragraphs do not discard the common run style; soft-break editing fails closed',async()=>{
 const contract=template.slides[0],component=contract.nodes.find(c=>c.kind==='text')!;
 for(const mode of ['leading-empty','soft-break'] as const){
  const zip=await JSZip.loadAsync(original),document=doc(await zip.file(contract.slidePath)!.async('string')) as unknown as Document;
  const sourceShape=shape(document,component.locator.shapeId),body=child(sourceShape,'txBody')!,paragraph=child(body,'p')!,firstRun=child(paragraph,'r')!;
  const originalStyle=serialized(child(firstRun,'rPr'));
  if(mode==='leading-empty'){
   const empty=paragraph.cloneNode(true) as Element;
   Array.from(empty.childNodes).filter(node=>node.nodeType===1&&['r','br','fld'].includes((node as Element).localName)).forEach(node=>empty.removeChild(node));body.insertBefore(empty,paragraph);
  }else paragraph.insertBefore(document.createElementNS(NS.a,'a:br'),firstRun.nextSibling);
  zip.file(contract.slidePath,serialized(document)!);
  const bytes=await zip.generateAsync({type:'uint8array'}),loaded=await loadBrowserTemplate(bytes),input=createBrowserDeckInput(loaded);
  const sourceNodes=await readSourceSlides(bytes);assert.equal(input.slides[0].nodes![component.key],sourceNodes[0].nodes.find(n=>n.id===component.locator.shapeId)!.text);
  assert.deepEqual(await validateBrowserDeck(loaded,input),[]);await generateBrowserDeck(loaded,input);
  input.slides[0].nodes![component.key]='新的标题';
  if(mode==='soft-break'){
   assert.match((await validateBrowserDeck(loaded,input)).join('\n'),/UNSUPPORTED_TEXT_FORMATTING/);await assert.rejects(generateBrowserDeck(loaded,input),/UNSUPPORTED_TEXT_FORMATTING/);
  }else{
   assert.deepEqual(await validateBrowserDeck(loaded,input),[]);
   const generated=await generateBrowserDeck(loaded,input),output=await JSZip.loadAsync(generated.bytes),slides=await readSourceSlides(generated.bytes);
   const outputDoc=doc(await output.file(slides[0].path)!.async('string')) as unknown as Document;
   assert.equal(serialized(shape(outputDoc,component.locator.shapeId).getElementsByTagNameNS(NS.a,'rPr')[0]),originalStyle);
  }
 }
});


test('ZIP central-directory budgets reject compressed media amplification before inflation',()=>{
 const limits={parts:3,partBytes:100,totalBytes:150,xmlPartBytes:40,xmlTotalBytes:60};
 assert.doesNotThrow(()=>assertBrowserPackageBudget([{path:'ppt/media/image.png',uncompressedBytes:80},{path:'slide.xml',uncompressedBytes:40}],limits));
 assert.throws(()=>assertBrowserPackageBudget([{path:'ppt/media/image.png',uncompressedBytes:101}],limits),/PART_TOO_LARGE/);
 assert.throws(()=>assertBrowserPackageBudget([{path:'one.png',uncompressedBytes:100},{path:'two.png',uncompressedBytes:51}],limits),/TOTAL_TOO_LARGE/);
 assert.throws(()=>assertBrowserPackageBudget([{path:'slide.xml',uncompressedBytes:41}],limits),/XML_PART_TOO_LARGE/);
 assert.throws(()=>assertBrowserPackageBudget([{path:'one.xml',uncompressedBytes:40},{path:'two.xml',uncompressedBytes:21}],limits),/XML_TOO_LARGE/);
 assert.throws(()=>assertBrowserPackageBudget(Array.from({length:4},(_,i)=>({path:`${i}.png`,uncompressedBytes:1})),limits),/TOO_MANY_PARTS/);
 for(const value of [-1,NaN,Infinity,1.5])assert.throws(()=>assertBrowserPackageBudget([{path:'bad',uncompressedBytes:value}],limits),/SIZE_METADATA/);
 const engine=readFileSync(new URL('../lib/workflow/browser-deck.ts',import.meta.url),'utf8');
 assert.ok(engine.indexOf('assertBrowserPackageBudget(packageEntries(zip))')<engine.indexOf('await inspectPackage(zip)'));
});

test('inherited master or layout navigation cannot retain original slides and notes in the output',async()=>{
 for(const owner of ['ppt/slideMasters/slideMaster1.xml','ppt/slideLayouts/slideLayout1.xml']){
  const zip=await JSZip.loadAsync(original),relPath=relationshipPartForOwner(owner);
  const relXml=await zip.file(relPath)!.async('string');
  zip.file(relPath,relXml.replace('</Relationships>',`<Relationship Id="rIdReviewInternal" Type="${NS.r}/slide" Target="../slides/slide1.xml"/></Relationships>`));
  const source=await zip.generateAsync({type:'uint8array'});
  await assert.rejects(loadBrowserTemplate(source),/UNSUPPORTED_INHERITED_SLIDE_LINK/);
 }
 // A nonstandard own-slide hyperlink relationship must also not reintroduce source parts.
 const zip=await JSZip.loadAsync(original),relPath=relationshipPartForOwner(template.slides[0].slidePath);
 const relXml=await zip.file(relPath)!.async('string');
 zip.file(relPath,relXml.replace('</Relationships>',`<Relationship Id="rIdReviewOld" Type="${NS.r}/hyperlink" Target="slide2.xml"/></Relationships>`));
 const loaded=await loadBrowserTemplate(await zip.generateAsync({type:'uint8array'}));
 await assert.rejects(generateBrowserDeck(loaded,createBrowserDeckInput(loaded)),/RETAINED_SOURCE_CONTENT/);
});

for(const [locale,relative] of [['Chinese','../public/demo/minimal-business/minimal-business-original.pptx'],['English','../public/demo/minimal-business/en/minimal-business-original.pptx']] as const){
 test(`${locale} browser-produced PPTX passes the complete CLI package verifier with canonical relationship IDs`,async()=>{
  const source=await readFile(new URL(relative,import.meta.url)),loaded=await loadBrowserTemplate(source),input=createBrowserDeckInput(loaded);
  assert.equal(input.slides.length,13);assert.deepEqual(await validateBrowserDeck(loaded,input),[]);
  let priorIds:string[]|undefined;
  for(let iteration=0;iteration<2;iteration++){
   const output=await generateBrowserDeck(loaded,input),zip=await JSZip.loadAsync(output.bytes),report=await verifyDeckPackage(zip);
   assert.equal(output.report.runtimePackageValidation,'passed');assert.equal(report.passed,true,JSON.stringify(report,null,2));assert.equal(report.slides,13);assert.deepEqual(report.errors,[]);assert.deepEqual(report.nonCanonicalRelationshipIds,[]);
   const relationships=doc(await zip.file('ppt/_rels/presentation.xml.rels')!.async('string'));
   const entries=Array.from(relationships.getElementsByTagName('Relationship'));
   const ids=entries.map(entry=>entry.getAttribute('Id')!);
   assert.ok(ids.every(id=>/^rId\d+$/.test(id)));assert.equal(new Set(ids).size,ids.length);
   const master=entries.find(entry=>entry.getAttribute('Type')!.endsWith('/slideMaster'));
   assert.equal(master!.getAttribute('Id'),'rId1');
   assert.ok(entries.filter(entry=>entry.getAttribute('Type')!.endsWith('/slide')).every(entry=>entry.getAttribute('Id')!=='rId1'));
   if(priorIds)assert.deepEqual(ids,priorIds);priorIds=ids;
  }
 });
}

test('public semantic growth proposal yields a browser PPTX accepted by the complete CLI verifier',async()=>{
 const source=await readFile(new URL('../public/demo/showcase/growth.pptx',import.meta.url)),slides=await readSourceSlides(source),sha256=await sha256Bytes(source);
 const model={bytes:Uint8Array.from(source).buffer,sha256,slides,mappingWarnings:[],deck:{slides:slides.map(slide=>({elements:[],note:slide.pageContract?[slide.pageContract.pageType,...slide.pageContract.logic].join('\n'):''})),size:{width:0,height:0},themeColors:[]}};
 const snapshot=await inspectWorkspace(model,{}),proposal=JSON.parse(await readFile(new URL('./fixtures/growth-semantic-proposal.json',import.meta.url),'utf8'));
 const patches=await applyMarkProposal(model,{},snapshot,proposal),marked=await writePptx(source,patches),loaded=await loadBrowserTemplate(marked);
 const input=JSON.parse(await readFile(new URL('./fixtures/growth-semantic-deck.json',import.meta.url),'utf8'));
 assert.deepEqual(await validateBrowserDeck(loaded,input),[]);
 for(let iteration=0;iteration<2;iteration++){
  const output=await generateBrowserDeck(loaded,input),zip=await JSZip.loadAsync(output.bytes),report=await verifyDeckPackage(zip);
  assert.equal(output.report.runtimePackageValidation,'passed');assert.equal(report.passed,true,JSON.stringify(report,null,2));assert.equal(report.slides,9);assert.deepEqual(report.errors,[]);
  assert.equal(output.report.visualGuarantee,false);assert.equal(output.report.nativeOfficeValidation,'not_run');
 }
});

test('browser output gate rejects errors found only by the shared CLI verifier',async()=>{
 const zip=await JSZip.loadAsync(original),slidePath=template.slides[0].slidePath;
 const slideXml=await zip.file(slidePath)!.async('string');
 zip.file(slidePath,slideXml.replace('</p:sld>','<p:timing><p:tnLst><p:spTgt spid="999999999"/></p:tnLst></p:timing></p:sld>'));
 const loaded=await loadBrowserTemplate(await zip.generateAsync({type:'uint8array'})),input=createBrowserDeckInput(loaded);
 assert.deepEqual(await validateBrowserDeck(loaded,input),[]);
 await assert.rejects(generateBrowserDeck(loaded,input),/BROWSER_OUTPUT_VERIFICATION:.*invalid animation targets/);
});
