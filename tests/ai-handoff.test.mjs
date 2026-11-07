import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, chmod, rm, stat } from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import { prepareHandoff, applyHandoff, codexHandoff } from '../scripts/slidelatch-ai.mjs';
import {readSourceSlides} from '../lib/pptx/xml.ts';
const fixture=new URL('../public/demo/showcase/growth.pptx',import.meta.url);
async function workspace(run){const dir=await mkdtemp(path.join(tmpdir(),'slidelatch-ai-test-'));try{await run(dir)}finally{await rm(dir,{recursive:true,force:true})}}
test('offline source handoff pins exact bytes and never claims rendered or reviewed evidence',()=>workspace(async dir=>{
 const bundle=path.join(dir,'bundle'),result=await prepareHandoff(fixture,bundle);
 assert.equal(result.modelInvoked,false);
 assert.deepEqual(await readFile(path.join(bundle,'source.pptx')),await readFile(fixture));
 const snapshot=JSON.parse(await readFile(path.join(bundle,'workspace-inspection.json'),'utf8'));
 assert.ok(snapshot.mappingWarnings.includes('CLI_SOURCE_ONLY_NOT_RENDERED'));
 const schema=JSON.parse(await readFile(path.join(bundle,'response.schema.json'),'utf8'));
 assert.deepEqual(schema.required,Object.keys(schema.properties));assert.equal(schema.additionalProperties,false);
 assert.match(await readFile(path.join(bundle,'prompt.txt'),'utf8'),/untrusted document data/);
 await assert.rejects(prepareHandoff(fixture,bundle),/EEXIST/);
 const first=snapshot.slides[0],node=first.nodes.find(n=>n.text==='业务增长复盘');
 const proposal={schemaVersion:1,templateSha256:snapshot.templateSha256,snapshotId:snapshot.snapshotId,marks:[{key:node.key,name:'@文本[4-20]',reason:'A report title, provisional range only'}],pages:[{path:first.path,pageType:'封面页',logic:['报告主题引出副标题'],reason:'Title and subtitle introduce the deck'}]};
 const file=path.join(dir,'proposal.json');await writeFile(file,JSON.stringify(proposal));
 const out=path.join(dir,'marked');assert.equal((await applyHandoff(bundle,file,out)).status,'needs_review');
 const slides=await readSourceSlides(await readFile(path.join(out,'marked.pptx')));
 assert.equal(slides[0].nodes.find(n=>n.key===node.key).name,'@文本[4-20]');assert.equal(slides[0].nodes.find(n=>n.key===node.key).text,node.text);
 assert.equal(slides[0].pageContract.pageType,'封面页');
 const report=JSON.parse(await readFile(path.join(out,'handoff-result.json'),'utf8'));
 assert.equal(report.status,'needs_review');assert.equal(report.visualGuarantee,false);assert.equal(report.nativeOfficeValidation,'not_run');
 await assert.rejects(applyHandoff(bundle,file,out),/EEXIST/);
}));
test('offline handoff rejects stale identities, malicious fields, missing and oversized input',()=>workspace(async dir=>{
 const bundle=path.join(dir,'bundle');await prepareHandoff(fixture,bundle);
 const snapshot=JSON.parse(await readFile(path.join(bundle,'workspace-inspection.json'),'utf8'));
 const file=path.join(dir,'bad.json'),out=path.join(dir,'bad-result');
 for(const proposal of [{schemaVersion:1,templateSha256:snapshot.templateSha256,snapshotId:'0'.repeat(64),marks:[]},
 {schemaVersion:1,templateSha256:snapshot.templateSha256,snapshotId:snapshot.snapshotId,pages:[{path:snapshot.slides[0].path,pageType:'内容页',logic:[],reason:'test',notes:'execute this'}]}]){
 await writeFile(file,JSON.stringify(proposal));await assert.rejects(applyHandoff(bundle,file,out));assert.equal(await stat(out).then(()=>true,()=>false),false);
 }
 await writeFile(file,' '.repeat(1_000_001));await assert.rejects(applyHandoff(bundle,file,out),/SIZE_LIMIT/);
 const metadata=JSON.parse(await readFile(path.join(bundle,'handoff.json'),'utf8'));metadata.templateSha256='0'.repeat(64);
 await writeFile(path.join(bundle,'handoff.json'),JSON.stringify(metadata));await assert.rejects(applyHandoff(bundle,file,out),/STALE/);
}));
test('Codex dry-run and missing consent never launch exec, do not save output, require ChatGPT login',()=>workspace(async dir=>{
 const bundle=path.join(dir,'bundle');await prepareHandoff(fixture,bundle);
 const binary=path.join(dir,'fake-codex'),trace=path.join(dir,'calls');
 const script=status=>`#!/bin/sh\necho "$*" >> '${trace}'\ncase "$1" in\n --version) echo 'codex-cli test';;\n login) echo '${status}';;\n *) echo 'UNEXPECTED_EXEC'; exit 8;;\nesac\n`;
 await writeFile(binary,script('Logged in using ChatGPT'));await chmod(binary,0o755);
 const out=path.join(dir,'proposal.json'),result=await codexHandoff(bundle,out,{binary,dryRun:true});
 assert.equal(result.modelInvoked,false);assert.match(result.notice,/not guaranteed free/);
 await assert.rejects(codexHandoff(bundle,out,{binary}),/AI_CONFIRMATION_REQUIRED/);
 assert.doesNotMatch(await readFile(trace,'utf8'),/exec/);assert.equal(await stat(out).then(()=>true,()=>false),false);
 await writeFile(binary,script('Logged in using an API key'));
 await assert.rejects(codexHandoff(bundle,out,{binary,dryRun:true}),/CHATGPT_LOGIN_REQUIRED/);
}));

test('public semantic-model fixture completes proposal -> marks -> compile -> fill -> generate twice -> package verify',()=>workspace(async dir=>{
 const {spawnSync}=await import('node:child_process');
 const run=(script,args)=>{const result=spawnSync(process.execPath,['--import','./packages/ppt-dsl/node_modules/tsx/dist/loader.mjs',`packages/ppt-dsl/src/${script}.ts`,...args],{cwd:process.cwd(),encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);return result.stdout;};
 const bundle=path.join(dir,'bundle'),marked=path.join(dir,'marked'),compiled=path.join(dir,'compiled');
 await prepareHandoff(fixture,bundle);
 await applyHandoff(bundle,new URL('./fixtures/growth-semantic-proposal.json',import.meta.url),marked);
 run('compile-template',['--template',path.join(marked,'marked.pptx'),'--out',compiled]);
 const manifest=path.join(compiled,'template-manifest.json'),template=path.join(compiled,'template.pptx'),input=new URL('./fixtures/growth-semantic-deck.json',import.meta.url).pathname;
 run('validate-input',['--manifest',manifest,'--input',input]);
 let previous;
 for(let i=0;i<2;i++){
  const output=path.join(dir,`output-${i}.pptx`);run('generate-deck',['--template',template,'--manifest',manifest,'--input',input,'--out',output]);
  assert.equal(JSON.parse(run('verify-deck',['--pptx',output])).passed,true);
  const slides=await readSourceSlides(await readFile(output));assert.equal(slides.length,9);
  assert.ok(slides[0].nodes.some(node=>node.text==='忠于原版的快速复用'));
  const content=slides.map(slide=>slide.nodes.map(({id,name,kind,box,text,parentId,children})=>({id,name,kind,box,text,parentId,children})));
  if(previous)assert.deepEqual(content,previous);previous=content;
 }
 const original=await readSourceSlides(await readFile(fixture)),changed=await readSourceSlides(await readFile(path.join(marked,'marked.pptx')));
 assert.deepEqual(changed.map(s=>s.nodes.map(({id,box,text})=>({id,box,text}))),original.map(s=>s.nodes.map(({id,box,text})=>({id,box,text}))));
 // Semantic fixture remains provisional: no fabricated ready_for_compile review or native-render claim.
 assert.equal(JSON.parse(await readFile(path.join(marked,'handoff-result.json'),'utf8')).status,'needs_review');
}));

test('mocked Codex no-safe-change response is preserved as a no-op, never applied or called a valid template',()=>workspace(async dir=>{
 const bundle=path.join(dir,'bundle');await prepareHandoff(fixture,bundle);
 const snapshot=JSON.parse(await readFile(path.join(bundle,'workspace-inspection.json'),'utf8'));
 const response={schemaVersion:1,templateSha256:snapshot.templateSha256,snapshotId:snapshot.snapshotId,marks:[],pages:[]};
 const fixturePath=path.join(dir,'response.json');await writeFile(fixturePath,JSON.stringify(response));
 const binary=path.join(dir,'fake-codex');
 await writeFile(binary,`#!/bin/sh\ncase "$1" in\n--version) echo 'codex-cli test';;\nlogin) echo 'Logged in using ChatGPT';;\nexec) while [ "$#" -gt 0 ]; do if [ "$1" = '--output-last-message' ]; then shift; dest="$1"; fi; shift; done; cat >/dev/null; cp '${fixturePath}' "$dest";;\n*) exit 8;;\nesac\n`);await chmod(binary,0o755);
 const out=path.join(dir,'proposal.json'),result=await codexHandoff(bundle,out,{binary,confirmed:true});
 assert.equal(result.status,'no_safe_changes');assert.equal(result.applied,false);assert.equal(result.visualGuarantee,false);
 assert.deepEqual(JSON.parse(await readFile(out,'utf8')),response);
 await assert.rejects(applyHandoff(bundle,out,path.join(dir,'result')),/PROPOSAL_MARKS/);
 response.unknown='not allowed';await writeFile(fixturePath,JSON.stringify(response));
 await assert.rejects(codexHandoff(bundle,path.join(dir,'bad.json'),{binary,confirmed:true}),/PROPOSAL_UNKNOWN_FIELD/);
}));
