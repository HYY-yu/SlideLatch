import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import JSZip from 'jszip';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {readSourceSlides,writePptx,NS} from '../lib/pptx/xml.ts';
import {applyMarkProposal,inspectWorkspace,sha256Bytes} from '../lib/workflow/session.ts';
Object.assign(globalThis,{DOMParser,XMLSerializer});
const slidePath='ppt/slides/slide1.xml',key=`${slidePath}#@page`;
const contract={pageType:'内容页',logic:['标题引出正文','正文说明结论']};
async function fixture(withNotes=false){
 const zip=new JSZip();
 zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>');
 zip.file('ppt/presentation.xml',`<p:presentation xmlns:p="${NS.p}" xmlns:r="${NS.r}"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`);
 zip.file('ppt/_rels/presentation.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS.r}/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="${NS.r}/notesMaster" Target="notesMasters/notesMaster1.xml"/></Relationships>`);
 zip.file('ppt/notesMasters/notesMaster1.xml',`<p:notesMaster xmlns:p="${NS.p}"/>`);
 zip.file(slidePath,`<p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Ordinary text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1270000" cy="127000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Original &amp; unchanged</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);
 zip.file('ppt/slides/_rels/slide1.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS.r}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>${withNotes?`<Relationship Id="rId5" Type="${NS.r}/notesSlide" Target="../notesSlides/notesSlide7.xml"/>`:''}</Relationships>`);
 zip.file('ppt/slideLayouts/slideLayout1.xml',`<p:sldLayout xmlns:p="${NS.p}"/>`);
 if(withNotes){
 zip.file('ppt/notesSlides/notesSlide7.xml',`<p:notes xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Speaker notes"/></p:nvSpPr><p:spPr/><p:txBody><a:p><a:r><a:t>封面页</a:t></a:r></a:p><a:p><a:r><a:t>Private original &amp; note</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`);
 zip.file('ppt/notesSlides/_rels/notesSlide7.xml.rels','<Relationships><Relationship Id="rId7" Target="../slides/slide1.xml"/></Relationships>');
 }
 const bytes=await zip.generateAsync({type:'uint8array'});
 return {zip,bytes,model:{bytes:bytes.buffer,sha256:await sha256Bytes(bytes),slides:await readSourceSlides(bytes),deck:{slides:[{elements:[{id:'2',type:'text'}]}],size:{width:960,height:540},themeColors:[]},mappingWarnings:[]}};
}
test('page-only proposals validate strictly and participate in snapshot freshness',async()=>{
 const {model}=await fixture(),snapshot=await inspectWorkspace(model,{});
 const page={path:slidePath,...contract,reason:'Explicit test classification'};
 const proposal={schemaVersion:1,templateSha256:model.sha256,snapshotId:snapshot.snapshotId,pages:[page]};
 const patches=await applyMarkProposal(model,{},snapshot,proposal);
 assert.deepEqual(patches,{[key]:{pageContract:contract}});
 assert.deepEqual((await inspectWorkspace(model,patches)).slides[0].pageContract,contract);
 await assert.rejects(applyMarkProposal(model,patches,snapshot,proposal),/STALE/);
 for(const pages of [[page,page],[{...page,path:'ppt/slides/slide99.xml'}],[{...page,pageType:'Other'}],[{...page,logic:['https://example.com']}],[{...page,logic:['内容页']}],[{...page,logic:['x\ny']}],[{...page,logic:['x'.repeat(301)]}],[{...page,logic:Array(21).fill('x')}],[{...page,notes:'arbitrary'}]])await assert.rejects(applyMarkProposal(model,{},snapshot,{...proposal,pages}));
 await assert.rejects(applyMarkProposal(model,{},snapshot,{...proposal,pages:[],marks:[]}));
});
test('new notes preserve original slide bytes and unrelated parts; repeated update is unique',async()=>{
 const {zip,bytes}=await fixture();
 const output=await writePptx(bytes,{[key]:{pageContract:contract}}),out=await JSZip.loadAsync(output);
 for(const name of Object.keys(zip.files).filter(n=>!zip.files[n].dir&&!['[Content_Types].xml','ppt/slides/_rels/slide1.xml.rels'].includes(n)))assert.equal(await out.file(name).async('string'),await zip.file(name).async('string'),name);
 const rel=await out.file('ppt/slides/_rels/slide1.xml.rels').async('string');assert.match(rel,/rId1/);assert.match(rel,/slideLayout1.xml/);assert.match(rel,/notesSlide1.xml/);
 const back=await out.file('ppt/notesSlides/_rels/notesSlide1.xml.rels').async('string');assert.match(back,/notesMaster/);assert.match(back,/slide1.xml/);
 assert.match(await out.file('[Content_Types].xml').async('string'),/notesSlide\+xml/);
 const slides=await readSourceSlides(output);assert.deepEqual(slides[0].pageContract,contract);assert.equal(slides[0].nodes.length,1);assert.equal(slides[0].nodes[0].text,'Original & unchanged');
 const again=await writePptx(output,{[key]:{pageContract:{pageType:'结尾页',logic:[]}}}),z=await JSZip.loadAsync(again);
 assert.equal((await z.file('ppt/notesSlides/notesSlide1.xml').async('string')).match(/name="slidelatch-page-contract"/g).length,1);
 assert.deepEqual((await readSourceSlides(again))[0].pageContract,{pageType:'结尾页',logic:[]});
 await assert.rejects(writePptx(bytes,{[key]:{pageContract:contract,text:'no'}}),/PATCH_PAGE/);
 await assert.rejects(writePptx(bytes,{[`${slidePath}#2`]:{pageContract:contract}}),/PATCH_PAGE/);
});
test('existing speaker notes, relationships and their text survive dedicated overrides',async()=>{
 const {zip,bytes,model}=await fixture(true);assert.equal(model.slides[0].pageContract.pageType,'封面页');
 const output=await writePptx(bytes,{[key]:{pageContract:contract}}),out=await JSZip.loadAsync(output);
 for(const name of Object.keys(zip.files).filter(n=>!zip.files[n].dir&&n!=='ppt/notesSlides/notesSlide7.xml'))assert.equal(await out.file(name).async('string'),await zip.file(name).async('string'),name);
 const notes=await out.file('ppt/notesSlides/notesSlide7.xml').async('string');assert.match(notes,/Private original &amp; note/);assert.match(notes,/封面页/);
 assert.deepEqual((await readSourceSlides(output))[0].pageContract,contract);
});
test('real compiler rejects role-free template, then accepts explicit metadata, preferring dedicated shape',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'slidelatch-page-'));
 try{
  const {bytes}=await fixture();const input=path.join(dir,'plain.pptx');await writeFile(input,bytes);
  const compile=(file,out)=>spawnSync(process.execPath,['--import','./packages/ppt-dsl/node_modules/tsx/dist/loader.mjs','packages/ppt-dsl/src/compile-template.ts','--template',file,'--out',out],{cwd:process.cwd(),encoding:'utf8'});
  const failed=compile(input,path.join(dir,'fail'));assert.notEqual(failed.status,0);assert.match(failed.stderr,/缺少有效页面类型/);
  for(const existing of [false,true]){
   const f=await fixture(existing),roles=['内容页','封面页','目录页','章节过渡页','结尾页'];
   const patches={};let ids='',rels='';
   for(const [index,pageType] of roles.entries()){
    const n=index+1,p=`ppt/slides/slide${n}.xml`;
    if(n>1)f.zip.file(p,await f.zip.file(slidePath).async('string'));
    ids+=`<p:sldId id="${255+n}" r:id="rId${n}"/>`;rels+=`<Relationship Id="rId${n}" Type="${NS.r}/slide" Target="slides/slide${n}.xml"/>`;
    patches[`${p}#@page`]={pageContract:{pageType,logic:n===1?contract.logic:[]}};
    patches[`${p}#2`]={name:'@文本[1-100]'};
   }
   f.zip.file('ppt/presentation.xml',`<p:presentation xmlns:p="${NS.p}" xmlns:r="${NS.r}"><p:sldIdLst>${ids}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`);
   f.zip.file('ppt/_rels/presentation.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`);
   const output=await writePptx(await f.zip.generateAsync({type:'uint8array'}),patches),file=path.join(dir,`${existing}.pptx`),out=path.join(dir,`out-${existing}`);
   await writeFile(file,output);const result=compile(file,out);assert.equal(result.status,0,result.stdout+result.stderr);
   const manifest=JSON.parse(await readFile(path.join(out,'template-manifest.json'),'utf8'));assert.equal(manifest.slides[0].pageType,'内容页');assert.deepEqual(manifest.slides[0].logic,contract.logic);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
