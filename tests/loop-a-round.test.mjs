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
