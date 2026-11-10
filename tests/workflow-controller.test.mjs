import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import JSZip from 'jszip';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import * as session from '../lib/workflow/session.ts';
import * as xml from '../lib/pptx/xml.ts';
import * as recognition from '../lib/workflow/recognition.ts';
import * as search from '../lib/workflow/constraint-search.ts';
import * as lists from '../lib/pptx/lists.ts';
Object.assign(globalThis,{DOMParser,XMLSerializer});

async function model(){
  const zip=new JSZip();
  zip.file('ppt/presentation.xml','<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>');
  zip.file('ppt/_rels/presentation.xml.rels','<Relationships><Relationship Id="rId1" Target="slides/slide1.xml"/></Relationships>');
  zip.file('ppt/slides/slide1.xml','<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="3" name="@文本[2-8]"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1270000" cy="127000"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>验收标题</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>');
  const bytes=await zip.generateAsync({type:'uint8array'}),slides=await xml.readSourceSlides(bytes);
  return {bytes:bytes.buffer,sha256:await session.sha256Bytes(bytes),slides,mappingWarnings:[],deck:{slides:[{elements:[{id:'3',type:'text',left:0,top:0,width:100,height:10}]}],size:{width:960,height:540},themeColors:[]}};
}

function controller(source,{inspection=session.inspectWorkspace}={}){
  const inspections=new Set();
  const hooks=[],effects=[],pending=[],host={},downloads=[],blobs=new Map(),revoked=[],errors=[],logs=[];
  let index=0,dirty=false,applied,rendered;
  let props={model:source,patches:{},fileName:'marked.pptx',editorState:'initial',busy:false,currentSlideIndex:0,visibleProbeId:null,svgRef:{current:null},onApply:value=>{applied=value},onPreview:probe=>{props={...props,visibleProbeId:probe?.id??null};dirty=true},onCapacityPreview:()=>{},onError:message=>errors.push(message)};
  const react={
    useState:initial=>{const slot=index++;if(!hooks[slot])hooks[slot]={value:initial};return [hooks[slot].value,value=>{hooks[slot].value=typeof value==='function'?value(hooks[slot].value):value;dirty=true}]},
    useRef:initial=>{const slot=index++;return hooks[slot]??(hooks[slot]={current:initial})},
    useEffect:(run,deps)=>{const slot=index++,old=effects[slot];if(!old||!deps||deps.some((value,i)=>value!==old.deps?.[i]))pending.push(()=>{old?.cleanup?.();effects[slot]={deps,cleanup:run()}})},
  };
  const code=ts.transpileModule(readFileSync(new URL('../components/pptx/workflow-controller.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const exports={},imports={react,'jszip':JSZip,'react-dom':{flushSync:action=>action()},'@/lib/workflow/recognition':recognition,'@/lib/workflow/constraint-search':search,'@/lib/workflow/measure-preview':{},'@/lib/pptx/lists':lists,'@/lib/pptx/xml':xml,'@/lib/workflow/session':{...session,inspectWorkspace:(...args)=>{const task=Promise.resolve().then(()=>inspection(...args));inspections.add(task);return task.finally(()=>inspections.delete(task))}}};
  vm.runInNewContext(code,{exports,require:name=>{if(name in imports)return imports[name];throw new Error(name)},window:host,AbortController,crypto,Blob,Uint8Array,Error,console:{info:(...args)=>logs.push(args),error:(...args)=>logs.push(args)},URL:{createObjectURL:blob=>{const url=`blob:qa-${blobs.size}`;blobs.set(url,blob);return url},revokeObjectURL:url=>revoked.push(url)},document:{createElement:()=>({click(){downloads.push({url:this.href,name:this.download})}})}});
  async function flush(){
    for(let round=0;round<8;round++){
      index=0;dirty=false;rendered=exports.default(props);while(pending.length)pending.shift()();
      await Promise.allSettled([...inspections]);
      await new Promise(resolve=>setImmediate(resolve));
      if(!dirty)return;
    }
    throw new Error('Controller did not settle');
  }
  return {flush,host,errors,logs,downloads,blobs,revoked,get rendered(){return rendered},get applied(){return applied},async update(next){props={...props,...next};await flush()},unmount(){for(const effect of effects)effect?.cleanup?.()}};
}

test('headless Skill controller owns live APIs, proposal history and source invalidation without rendering handoff UI',async()=>{
  const source=await model(),view=controller(source);await view.flush();assert.equal(view.rendered,null);
  const api=view.host.slidelatchWorkflow,snapshot=await api.inspect(),key=source.slides[0].nodes[0].key;
  assert.throws(()=>api.recordObservation({probeId:'missing',snapshotId:snapshot.snapshotId,verdict:'pass',reason:'Synthetic test'}));
  const probe=api.getReview().probes[0];api.previewProbe(probe.id);await view.flush();
  view.host.slidelatchWorkflow.recordObservation({probeId:probe.id,snapshotId:snapshot.snapshotId,verdict:'pass',reason:'Synthetic lifecycle test, not visual evidence'});
  assert.equal(view.host.slidelatchWorkflow.getReview().observations.length,1);
  const proposal={schemaVersion:1,templateSha256:source.sha256,snapshotId:snapshot.snapshotId,marks:[{key,name:'@文本[2-10]',reason:'Synthetic test'}]};
  await view.host.slidelatchWorkflow.applyProposal(proposal);assert.equal(view.applied[key].name,'@文本[2-10]');
  await view.update({patches:view.applied});assert.equal(view.host.slidelatchWorkflow.getReview().observations.length,0);
  await assert.rejects(view.host.slidelatchWorkflow.applyProposal(proposal),/STALE/);
  await view.update({busy:true});await assert.rejects(view.host.slidelatchWorkflow.inspect(),/unfinished edits/);await assert.rejects(view.host.slidelatchWorkflow.searchTextCapacity({key,upper:1}),/unfinished edits/);
  view.unmount();assert.equal(view.host.slidelatchWorkflow,undefined);await assert.rejects(api.inspect(),/Workspace changed/);
});

test('Skill review export binds the actual written PPTX bytes without creating approval',async()=>{
  const source=await model(),key=source.slides[0].nodes[0].key,view=controller(source);await view.update({patches:{[key]:{text:'人工修正'}}});
  const result=await view.host.slidelatchWorkflow.exportReviewBundle();assert.equal(result.status,'needs_review');
  assert.equal(view.downloads.length,1);assert.equal(view.downloads[0].name,'marked-workflow.zip');
  const blob=view.blobs.get(view.downloads[0].url),bundle=await JSZip.loadAsync(await blob.arrayBuffer());
  const bytes=await bundle.file('marked.pptx').async('uint8array'),review=JSON.parse(await bundle.file('workflow-review.json').async('string'));
  assert.equal(review.templateSha256,await session.sha256Bytes(bytes));assert.equal(result.templateSha256,review.templateSha256);
  assert.equal((await xml.readSourceSlides(bytes))[0].nodes[0].text,'人工修正');assert.equal(review.observations.length,0);assert.equal(review.nativeOfficeValidation,'not_run');
  view.unmount();assert.deepEqual(view.revoked,[view.downloads[0].url]);
});

test('headless initialization errors reach the visible parent error owner and diagnostic log',async()=>{
  const view=controller(await model(),{inspection:async()=>{throw new Error('BROKEN_INSPECTION')}});await view.flush();
  assert.deepEqual(view.errors,['BROKEN_INSPECTION']);assert.equal(view.logs[0][0],'[SlideLatch] workflow.inspect.failed');
  await assert.rejects(view.host.slidelatchWorkflow.inspect(),/Workspace changed/);view.unmount();
});
