import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync,spawn} from 'node:child_process';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {readSourceSlides} from '../lib/pptx/xml.ts';
import {inspectWorkspace,createBoundaryProbes,createWorkflowReview,sha256Bytes} from '../lib/workflow/session.ts';
Object.assign(globalThis,{DOMParser,XMLSerializer});
const root=path.resolve(new URL('..',import.meta.url).pathname);
test('release CLI compiles an exact-byte review fixture, rejects reused output and fails closed on missing evidence',async()=>{
 // Synthetic approval records exercise plumbing only; never persist or present them as visual QA evidence.
 const dir=await mkdtemp(path.join(os.tmpdir(),'slidelatch-release-test-'));
 try{
  const bytes=await readFile(path.join(root,'public/demo/minimal-business/minimal-business-original.pptx')),slides=await readSourceSlides(bytes),sha256=await sha256Bytes(bytes);
  const model={bytes:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),slides,sha256,mappingWarnings:[],deck:{slides:slides.map(s=>({elements:s.nodes.map(n=>({id:n.id,type:'shape',left:0,top:0,width:10,height:10}))})),size:{width:960,height:540},themeColors:[]}};
  const snapshot=await inspectWorkspace(model,{}),probes=createBoundaryProbes(model,{},snapshot.snapshotId);
  const observations=probes.map(p=>({probeId:p.id,snapshotId:snapshot.snapshotId,verdict:'pass',reason:'SYNTHETIC TEST ONLY; not a visual observation',renderer:'slidelatch-svg',observedAt:'2026-11-07T10:00:00Z'}));
  const report=createWorkflowReview(snapshot,probes,observations,sha256);assert.equal(report.status,'ready_for_compile');
  await writeFile(path.join(dir,'marked.pptx'),bytes);await writeFile(path.join(dir,'review.json'),JSON.stringify(report));
  const run=out=>spawnSync(process.execPath,['--import','./packages/ppt-dsl/node_modules/tsx/dist/loader.mjs','scripts/slidelatch-release.ts','--template',path.join(dir,'marked.pptx'),'--review',path.join(dir,'review.json'),'--out',path.join(dir,out)],{cwd:root,encoding:'utf8',timeout:30000});
  const first=run('compiled');assert.equal(first.status,0,first.stderr);
  const manifest=JSON.parse(await readFile(path.join(dir,'compiled/template-manifest.json'),'utf8'));assert.equal(manifest.templateSha256,sha256);assert.equal(manifest.sourceTemplate,'template.pptx');assert.equal(manifest.slideCount,33);
  assert.equal(await sha256Bytes(await readFile(path.join(dir,'compiled/template.pptx'))),sha256);
  assert.equal(JSON.parse(await readFile(path.join(dir,'compiled/workflow-release.json'),'utf8')).complete,true);
  const race=()=>new Promise(resolve=>{const child=spawn(process.execPath,['--import','./packages/ppt-dsl/node_modules/tsx/dist/loader.mjs','scripts/slidelatch-release.ts','--template',path.join(dir,'marked.pptx'),'--review',path.join(dir,'review.json'),'--out',path.join(dir,'concurrent')],{cwd:root,stdio:'ignore'});child.on('close',code=>resolve(code));});
  const results=await Promise.all([race(),race()]);assert.equal(results.filter(code=>code===0).length,1);
  assert.equal(JSON.parse(await readFile(path.join(dir,'concurrent/workflow-release.json'),'utf8')).complete,true);
  const second=run('compiled');assert.notEqual(second.status,0);assert.match(second.stderr,/RELEASE_OUTPUT_EXISTS/);
  await writeFile(path.join(dir,'review.json'),JSON.stringify({...report,observations:observations.slice(1)}));
  const bad=run('rejected');assert.notEqual(bad.status,0);assert.match(bad.stderr,/RELEASE_INCOMPLETE_BOUNDARY_REVIEW/);assert.equal(await stat(path.join(dir,'rejected')).then(()=>true,()=>false),false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
