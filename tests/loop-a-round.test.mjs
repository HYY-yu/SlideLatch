import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { round } from '../scripts/loop-a-round.mjs';
const input = { issue: 9, authorized: true, authorization: 'fixture authorization', dependenciesAccepted: true, prPending: false, confirmationRequired: false, guiRequired: false, action: 'inspect' };
async function fixture() {
 const root = await mkdtemp(join(tmpdir(), 'loop-a-'));
 const main = join(root, 'main'), cwd = join(root, 'writer');
 execFileSync('git', ['init', main]);
 const git = (...a) => execFileSync('git', ['-C', main, ...a]);
 git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-m', 'fixture');
 git('worktree', 'add', '-b', 'writer', cwd);
 return { main, cwd };
}
test('main protected; no eligible Issue safely exits', async () => {
 const f = await fixture();
 assert.equal((await round({ cwd: f.main })).status, 'independent-worktree-required');
 assert.equal((await round(f)).status, 'no-eligible-issue');
});
test('fail closed for authorization, dependency, PR, confirmation, GUI and forbidden actions', async () => {
 for (const [patch, status] of [[{authorized:false},'authorization-required'],[{dependenciesAccepted:false},'dependency-wait'],[{prPending:true},'pr-acceptance-wait'],[{confirmationRequired:true},'confirmation-required'],[{guiRequired:true},'gui-queued'],[{action:'merge'},'forbidden-action']]) {
  const f = await fixture();
  assert.equal((await round({...f,input:{...input,...patch}})).status,status);
 }
});
test('two rounds without new commit pause Issue', async () => {
 const f = await fixture();
 assert.equal((await round({...f,input})).paused,false);
 assert.equal((await round({...f,input})).paused,true);
 assert.equal((await round({...f,input})).status,'issue-paused');
});
test('two identical blockers pause Issue', async () => {
 const f = await fixture(), blocked = {...input,dependenciesAccepted:false};
 await round({...f,input:blocked});
 assert.equal((await round({...f,input:blocked})).paused,true);
});
test('concurrent calls serialize; stale lock remains busy', async () => {
 const f = await fixture();
 const results = await Promise.all([round({...f,input}),round({...f,input})]);
 assert.equal(results.filter(r=>r.status==='busy').length,1);
 await mkdir(join(f.main,'.git','loop-a','lock'));
 assert.equal((await round({...f,input})).status,'busy');
});
test('budgets cannot exceed ceilings and tiny deadline exits', async () => {
 const f = await fixture();
 for (const patch of [{attempts:3},{attempts:0},{timeoutMs:1200001}]) await assert.rejects(round({...f,...patch}),/invalid budget/);
 await assert.rejects(round({...f,timeoutMs:1}));
});
test('invalid JSON input never claims or strands the lock', async () => {
 const f = await fixture();
 for (const input of [null, [], false, 1, 'input']) await assert.rejects(round({...f,input}),/invalid input object/);
 assert.equal((await round({...f,input})).status,'inspected');
});
test('damaged history fails closed without overwriting evidence or stranding lock', async () => {
 const { writeFile, readFile, access } = await import('node:fs/promises');
 const f = await fixture();
 await round({...f,input});
 const path = join(f.main,'.git','loop-a','issue-9.json');
 const good = JSON.parse(await readFile(path,'utf8'));
 const invalid = [null, [], {}, {...good,extra:true}, ...['blocked','stagnant','head','reason','paused'].map(key => {const h={...good};delete h[key];return h;}), ...[-100,3,0.5,'1',null].flatMap(value=>[{...good,stagnant:value},{...good,blocked:value}]), {...good,head:'bad'}, {...good,head:null}, {...good,reason:'unknown'}, {...good,reason:'timeout'}, {...good,paused:'false'}, {...good,paused:true}, {...good,stagnant:2,paused:false}];
 for (const history of invalid) {
  const bytes=JSON.stringify(history);
  await writeFile(path,bytes);
  await assert.rejects(round({...f,input}),/invalid history schema/);
  assert.equal(await readFile(path,'utf8'),bytes);
  await assert.rejects(access(join(f.main,'.git','loop-a','lock')), {code:'ENOENT'});
 }
 await writeFile(path,JSON.stringify(good));
 assert.equal((await round({...f,input})).paused,true);
});
