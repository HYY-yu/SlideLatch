import test from 'node:test';
import assert from 'node:assert/strict';
import { prepare, complete } from '../scripts/loop-a-once.mjs';
const base = 'a'.repeat(40), head = 'b'.repeat(40);
function fixture() {
 const p = { repository:'HYY-yu/SlideLatch',issue:13,deadline:1000,maxRepairs:2,worktree:'/task',baseSha:base,branch:'task',paths:['file'] };
 const actors = ['writer','reviewer'].map(role => ({id:role,role,stopped:true,lastActivity:50}));
 const commands = ['writer','reviewer','commit'].map((role,i) => ({actor:role === 'commit'?'writer':role,label:role === 'commit'?'commit':'verify',status:'EXITED',identity:{head,pid:i+1,started:20},exit:{pid:i+1,started:20,ended:40,groupGone:true,code:0}}));
 const s = {phase:'RELEASED',mutation:null,issue:13,cwd:'/task',base,head,branch:'task',paths:['file'],deadline:1000,repair:0,actors,authors:['writer'],commands,review:{actor:'reviewer',head,passed:true},pr:{head,draft:true,url:'https://github.com/HYY-yu/SlideLatch/pull/14'},ci:{head,passed:true,mergeSha:base,run:'run'},stopEvidence:{at:60,observations:actors.map(a=>({id:a.id,status:'stop-acknowledged',noExternalProcesses:true,source:'host',observedAt:60}))}};
 const r={repository:p.repository,issue:13,head,draft:true,url:s.pr.url,run:'run',mergeSha:base,passed:true,source:'GitHub',observedAt:70}; return [p,s,r];
}
test('complete requires the full structural evidence set',()=> assert.equal(complete(...fixture(),100).head,head));
for (const [name, mutate] of Object.entries({cancel:s=>{s.review=null;},oldHead:s=>{s.head=base;},pending:s=>{s.commands[0].status='PENDING';},unknown:s=>{s.commands[0].status='UNCERTAIN';},fakeExit:s=>{s.commands[0].exit=null;},authorReview:s=>{s.authors.push('reviewer');},missingStop:s=>{s.stopEvidence=null;},oldVerify:s=>{s.commands[0].identity.head=base;},noPr:s=>{s.pr=null;},noCi:s=>{s.ci=null;},notReleased:s=>{s.phase='CI';},repair:s=>{s.repair=3;}})) test(`reject ${name}`,()=>{const f=fixture();mutate(f[1]);assert.throws(()=>complete(...f,100));});
test('reject stale remote and deadline',()=>{const f=fixture();f[2].head=base;assert.throws(()=>complete(...f,100));assert.throws(()=>complete(...fixture(),1001));});
test('missing or invalid invocation is rejected before side effects',async()=>{for(const p of [undefined,{}, {version:1,repository:'HYY-yu/SlideLatch',issue:13}]) await assert.rejects(prepare(p));});
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
test('prepare uses real independent Git worktrees and rejects path and SHA drift',async()=>{
 const root=await mkdtemp(join(tmpdir(),'once-')); const repo=join(root,'repo'), task=join(root,'task');
 const g=(...a)=>execFileSync('/usr/bin/git',a,{encoding:'utf8'}).trim();
 try {
 g('init',repo);g('-C',repo,'config','user.email','test@example.com');g('-C',repo,'config','user.name','Test');await writeFile(join(repo,'file'),'base');g('-C',repo,'add','file');g('-C',repo,'commit','-m','base');const h=g('-C',repo,'rev-parse','HEAD');g('-C',repo,'worktree','add','-b','task',task);
 const input={version:1,repository:'HYY-yu/SlideLatch',issue:13,authorization:'explicit test fixture',owner:'host',publish:true,entryRoot:repo,entrySha:h,worktree:task,branch:'task',baseSha:h,paths:['file'],startedAt:100,maxRepairs:2};
 assert.equal((await prepare(input,101)).acquire.timeoutMs,1199999);
 for(const patch of [{paths:['../escape']},{paths:['*']},{entrySha:base},{baseSha:base},{worktree:repo},{startedAt:-1200000},{publish:false}]) await assert.rejects(prepare({...input,...patch},101));
 } finally {await rm(root,{recursive:true,force:true});}
});
