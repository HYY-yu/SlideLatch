import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { inspectWorkspace, applyMarkProposal, createBoundaryProbes, createWorkflowReview, sha256Bytes } from '../lib/workflow/session.ts';
import { validateReleaseReview } from '../lib/workflow/release.ts';
import { readSourceSlides, writePptx } from '../lib/pptx/xml.ts';
Object.assign(globalThis,{DOMParser,XMLSerializer});
async function fixture(){
 const zip=new JSZip();
 zip.file('ppt/presentation.xml','<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>');
 zip.file('ppt/_rels/presentation.xml.rels','<Relationships><Relationship Id="rId1" Target="slides/slide7.xml"/></Relationships>');
 zip.file('ppt/slides/slide7.xml','<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="3" name="@文本[0-8]"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1270000" cy="127000"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>测试样例</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>');
 const bytes=await zip.generateAsync({type:'uint8array'}),slides=await readSourceSlides(bytes);
 return {bytes:bytes.buffer,sha256:await sha256Bytes(bytes),slides,deck:{slides:[{note:'内容页',elements:[{id:'3',type:'text',left:0,top:0,width:100,height:10}]}],size:{width:960,height:540},themeColors:[]},mappingWarnings:[]};
}
const observed=(probe,snapshotId,verdict='pass')=>({probeId:probe.id,snapshotId,verdict,reason:'Synthetic unit-test assertion, not real visual QA',renderer:'slidelatch-svg',observedAt:'2026-11-07T10:00:00Z'});

test('workspace inspection is stable across patch key ordering and retains source identities',async()=>{
 const model=await fixture(),key=model.slides[0].nodes[0].key;
 const a=await inspectWorkspace(model,{[key]:{name:'@文本[1-9]',text:'新文案'}}),b=await inspectWorkspace(model,{[key]:{text:'新文案',name:'@文本[1-9]'}});
 assert.equal(a.snapshotId,b.snapshotId);assert.equal(a.slides[0].path,'ppt/slides/slide7.xml');assert.equal(a.slides[0].nodes[0].name,'@文本[1-9]');assert.equal(a.slides[0].note,'内容页');
 assert.notEqual((await inspectWorkspace(model,{})).snapshotId,a.snapshotId);
});
test('AI proposals apply only allowed names and fail atomically for stale, unknown or duplicate targets',async()=>{
 const model=await fixture(),snapshot=await inspectWorkspace(model,{}),key=model.slides[0].nodes[0].key;
 const proposal={schemaVersion:1,templateSha256:model.sha256,snapshotId:snapshot.snapshotId,marks:[{key,name:'@文本[1-12]',reason:'Test candidate'}]};
 const next=await applyMarkProposal(model,{},snapshot,proposal);assert.deepEqual(next,{[key]:{name:'@文本[1-12]'}});assert.equal(model.slides[0].nodes[0].name,'@文本[0-8]');
 await assert.rejects(applyMarkProposal(model,next,snapshot,proposal),/STALE/);
 for(const change of [{marks:[{...proposal.marks[0],key:'bad'}]},{marks:[proposal.marks[0],proposal.marks[0]]},{marks:[{...proposal.marks[0],name:'@图表'}]},{marks:[{...proposal.marks[0],name:'@文本[8-2]'}]},{marks:[{...proposal.marks[0],box:{}}]},{execute:'alert(1)'}])await assert.rejects(applyMarkProposal(model,{},snapshot,{...proposal,...change}));
});
test('boundary plan includes zero and maximum without changing the PPTX or text',async()=>{
 const model=await fixture(),snapshot=await inspectWorkspace(model,{}),probes=createBoundaryProbes(model,{},snapshot.snapshotId);
 assert.equal(probes.length,2);assert.equal(probes[0].value,0);assert.equal(probes[0].text,'');assert.equal(Array.from(probes[1].text).length,8);assert.equal(model.slides[0].nodes[0].text,'测试样例');
});
test('release review requires complete current passes, exact artifact binding and no program errors',async()=>{
 const model=await fixture(),snapshot=await inspectWorkspace(model,{}),probes=createBoundaryProbes(model,{},snapshot.snapshotId),observations=probes.map(p=>observed(p,snapshot.snapshotId));
 const make=(p=probes,o=observations,sha=model.sha256,s=snapshot)=>createWorkflowReview(s,p,o,sha);
 assert.equal(make().status,'ready_for_compile');assert.equal(make(probes.slice(0,1),observations.slice(0,1)).status,'needs_review');
 assert.equal(make(probes,[]).status,'needs_review');assert.equal(make(probes,observations.map(o=>({...o,snapshotId:'stale'}))).status,'needs_review');
 assert.equal(make(probes,[...observations,observed(probes[0],snapshot.snapshotId,'fail')]).status,'needs_review');
 assert.equal(make(probes,observations,'').status,'needs_review');assert.equal(make(probes,observations,model.sha256,{...snapshot,issues:['BAD']}).status,'invalid');
 assert.equal(make().visualGuarantee,false);assert.equal(make().nativeOfficeValidation,'not_run');
});
test('release gate re-derives expected probes from exact OOXML and rejects forged omissions, stale evidence and hash mismatches',async()=>{
 const model=await fixture(),snapshot=await inspectWorkspace(model,{}),probes=createBoundaryProbes(model,{},snapshot.snapshotId),observations=probes.map(p=>observed(p,snapshot.snapshotId));
 const report=createWorkflowReview(snapshot,probes,observations,model.sha256),bytes=new Uint8Array(model.bytes);
 assert.equal((await validateReleaseReview(bytes,report)).status,'ready_for_compile');
 for(const change of [{templateSha256:'0'.repeat(64)},{probes:probes.slice(1),observations:observations.slice(1)},{observations:[...observations,{...observations[0]}]},{observations:observations.map(o=>({...o,snapshotId:'stale'}))},{probes:[{...probes[0],value:1},probes[1]]},{programmatic:{issues:[],mappingWarnings:['unmapped']}},{visualGuarantee:true}])await assert.rejects(validateReleaseReview(bytes,{...report,...change}));
 const changed=await writePptx(bytes,{[model.slides[0].nodes[0].key]:{name:'@文本[0-9]'}});
 await assert.rejects(validateReleaseReview(changed,report),/HASH_MISMATCH/);
});
test('oversized preview cannot be approved by a supplied pass',async()=>{
 const model=await fixture(),key=model.slides[0].nodes[0].key,patches={[key]:{name:'@文本[0-10001]'}},snapshot=await inspectWorkspace(model,patches),probes=createBoundaryProbes(model,patches,snapshot.snapshotId);
 assert.equal(probes[1].text.length,10000);assert.equal(createWorkflowReview(snapshot,probes,probes.map(p=>observed(p,snapshot.snapshotId)),model.sha256).status,'needs_review');
});

test('inspection recalculates render coverage for newly marked and unmarked shapes',async()=>{
 const model=await fixture();model.deck.slides[0].elements=[];
 const key=model.slides[0].nodes[0].key;
 assert.deepEqual((await inspectWorkspace(model,{})).mappingWarnings,[key]);
 assert.deepEqual((await inspectWorkspace(model,{[key]:{name:'Fixed content'}})).mappingWarnings,[]);
});

test('inspection returns detached nested data rather than mutable source model aliases',async()=>{
 const model=await fixture(),snapshot=await inspectWorkspace(model,{}),source=model.slides[0].nodes[0];
 snapshot.slides[0].nodes[0].children.push('fake');snapshot.slides[0].nodes[0].box.width=999;
 assert.deepEqual(source.children,[]);assert.notEqual(source.box.width,999);
});
