import test from 'node:test';
import assert from 'node:assert/strict';
import { selectWork } from '../scripts/loop-a-once.mjs';
import { validateWork, validateMergeSnapshot } from '../scripts/loop-a-lifecycle.mjs';
const head = 'a'.repeat(40), base = 'b'.repeat(40), mergeSha = 'c'.repeat(40);
const target = { number: 20, url: 'https://github.com/HYY-yu/SlideLatch/pull/20', head, base, baseRef: 'main', headRef: 'feature', authors: ['historical-writer'], source: 'trusted host and GitHub read', observedAt: 100 };
const work = { kind: 'existing-pr', key: 'pr-20', goal: 'Advance the authorized development loop', authorizationSource: 'user decision', scopeSource: 'coordinator inspection', target, mergeAuthorization: 'user approved accepted PR merges' };
test('PR-first chooses failed checks before review, merge and eligible tasks', () => {
 const prs = [{ number: 1, priority: 'merge' }, { number: 2, priority: 'review' }, { number: 3, priority: 'failed-checks' }, { number: 4, priority: 'failed-checks', coveredBy: 9 }].map(p => ({ ...p, state: 'OPEN', authorized: true, owner: null }));
 const tasks = [{ key: 'small', authorized: true, dependenciesAccepted: true, owner: null }];
 assert.equal(selectWork({ prs, tasks }).number, 3);
 assert.equal(selectWork({ prs: [], tasks }).key, 'small');
 assert.equal(selectWork({ prs: prs.map(p => ({ ...p, owner: 'other' })), tasks: [] }), null);
 assert.equal(selectWork({ prs: [], tasks: [{ ...tasks[0], authorized: false }] }), null);
});
test('work distinguishes optional Issue from user authorization and generated scope', () => {
 assert.deepEqual(validateWork(work, 100), work);
 for (const patch of [{ authorizationSource: '' }, { scopeSource: '' }, { target: { ...target, authors: [] } }, { target: { ...target, headRef: '' } }]) assert.throws(() => validateWork({ ...work, ...patch }, 100));
});
const snapshot = () => ({ ...target, draft: false, state: 'OPEN', mergeable: true, unresolved: 0, reviewDecision: 'APPROVED', checksComplete: true, requiredChecks: ['verify'], checks: [{ name: 'verify', conclusion: 'success', head: mergeSha, source: 'GitHub check' }], run: 'run', ciMergeSha: mergeSha, acceptance: { head, base, passed: true, evidence: 'independent acceptance' } });
test('merge checks fresh head/base, exact CI, unresolved reviews and native acceptance', () => {
 const state = { head, pr: target, ci: { head, base, mergeSha, run: 'run' }, review: { head, base, passed: true } };
 assert.equal(validateMergeSnapshot(snapshot(), state, 100).head, head);
 for (const patch of [{ head: base }, { base: head }, { draft: true }, { unresolved: 1 }, { reviewDecision: 'CHANGES_REQUESTED' }, { reviewDecision: 'REVIEW_REQUIRED' }, { checksComplete: false }, { requiredChecks: [] }, { checks: [] }, { observedAt: -60001 }, { acceptance: { head, base: head, passed: true, evidence: 'old base' } }]) assert.throws(() => validateMergeSnapshot({ ...snapshot(), ...patch }, state, 100));
});

import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { acquire, inspect, transition, managedCommand } from '../scripts/loop-a-lifecycle.mjs';
import { beginInvocation, prepare, complete, admit, observeDeployment } from '../scripts/loop-a-once.mjs';
async function fixture(run, { publish = true, existing = true } = {}) {
 const root = await mkdtemp(join(tmpdir(), 'slidelatch-pr-first-'));
 const repo = join(root, 'repo'), cwd = join(root, 'local-owner'), reviewerCwd = join(root, 'reviewer');
 const git = (path, ...args) => execFileSync('/usr/bin/git', ['-C', path, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
 try {
  execFileSync('/usr/bin/git', ['init', repo], { stdio: 'pipe' });
  git(repo, 'config', 'user.name', 'Fixture'); git(repo, 'config', 'user.email', 'fixture@example.invalid');
  git(repo, 'remote', 'add', 'origin', 'https://github.com/HYY-yu/SlideLatch.git');
  await writeFile(join(repo, 'file'), 'base');
  await writeFile(join(repo, 'package.json'), JSON.stringify({ scripts: { verify: 'node -e "process.exit(0)"' } }));
  git(repo, 'add', '.'); git(repo, 'commit', '-m', 'base'); const base = git(repo, 'rev-parse', 'HEAD');
  await writeFile(join(repo, 'file'), 'PR change'); git(repo, 'commit', '-am', 'PR'); const head = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'worktree', 'add', '-b', 'local-owner', cwd);
  const startedAt = Date.now(), invocationRecord = join(root, 'invocation.json');
  await beginInvocation(invocationRecord, { worktree: cwd, invocationId: 'test', startedAt });
  const currentWork = { ...work, kind: existing ? 'existing-pr' : 'implementation', target: existing ? { ...target, head, base, observedAt: Date.now() } : null };
  const input = { version: 2, repository: 'HYY-yu/SlideLatch', issue: null, authorization: 'user authorized fixture goal', owner: 'coordinator', publish, work: currentWork, entryRoot: repo, entrySha: head, baseSha: head, worktree: cwd, branch: 'local-owner', paths: ['file'], invocationRecord, invocationId: 'test', startedAt, maxRepairs: 2 };
  const plan = await prepare(input), cap = await acquire(cwd, { ...plan.acquire, timeoutMs: plan.deadline - Date.now() - 1000 });
  assert.equal((await admit(plan, cap)).status, 'READY');
  const call = async (action, data = {}, actor = cap, path = cwd, operation_id = crypto.randomUUID()) => transition(path, { ...actor, expected_revision: (await inspect(cwd)).revision, operation_id, action, data });
  const bind = async (role, id) => {
   await call('dispatch-intent', { role });
   const intent = (await inspect(cwd)).actors.at(-1).intent;
   const path = role === 'writer' ? cwd : reviewerCwd + crypto.randomUUID();
   if (role === 'reviewer') git(repo, 'worktree', 'add', '--detach', path, git(cwd, 'rev-parse', 'HEAD'));
   const token = crypto.randomUUID();
   if (role === 'reviewer' && existing) await assert.rejects(call('bind-actor', { intent, id: 'historical-writer', capability: token, worktree: path }), /identity conflict/);
   await call('bind-actor', { intent, id, capability: token, worktree: path });
   return { cap: { epoch: cap.epoch, token }, path, id };
  };
  const command = async (actor, label) => managedCommand(actor.path, { ...actor.cap, expected_revision: (await inspect(cwd)).revision, operation_id: crypto.randomUUID(), data: { label } });
  const stop = async () => call('confirm-quiescent', { observations: (await inspect(cwd)).actors.map(a => ({ id: a.id, status: 'stop-acknowledged', noExternalProcesses: true, source: 'test native stop acknowledgement', observedAt: Date.now() })) });
  const review = async () => {
   const actor = await bind('reviewer', 'reviewer-' + crypto.randomUUID());
   await assert.rejects(command(actor, 'commit'), /command forbidden/);
   await assert.rejects(call('write', { path: 'file', content: 'forbidden' }, actor.cap, actor.path), /write forbidden/);
   await assert.rejects(call('record-review', { head: git(cwd, 'rev-parse', 'HEAD'), base, passed: true, evidence: 'no actual verify' }, actor.cap, actor.path), /current reviewer verify/);
   await command(actor, 'verify');
   await call('record-review', { head: git(cwd, 'rev-parse', 'HEAD'), base, passed: true, evidence: 'actual independent review' }, actor.cap, actor.path);
   await stop();
   const s = await inspect(cwd);
   await call('record-pr', { head: s.head, base, baseRef: 'main', headRef: 'feature', draft: !existing, number: 20, url: target.url, source: 'GitHub PR read', observedAt: Date.now() });
   await call('record-ci', { head: s.head, base, mergeSha, run: 'run', passed: true, source: 'GitHub check read', observedAt: Date.now() });
  };
  const remote = async () => { const s = await inspect(cwd); return { repository: input.repository, issue: null, head: s.head, base, baseRef: 'main', headRef: 'feature', draft: !existing, url: target.url, run: 'run', mergeSha, passed: true, source: 'GitHub fresh read', observedAt: Date.now() }; };
  const archive = async () => JSON.parse(await readFile(join(repo, '.git', 'loop-a', `released-${cap.epoch}`, 'state.json'), 'utf8'));
  await run({ root, repo, cwd, git, head, base, cap, call, plan, bind, command, stop, review, remote, archive });
 } finally { await rm(root, { recursive: true, force: true }); }
}
test('existing PR without Issue or writer needs actual independent current-head verify', () => fixture(async f => {
 assert.equal((await inspect(f.cwd)).phase, 'SEALED');
 await assert.rejects(f.call('dispatch-intent', { role: 'writer' }), /invalid dispatch/);
 await assert.rejects(f.call('release'), /release evidence/);
 await f.review();
 const remote = await f.remote();
 await f.call('release');
 const state = await f.archive();
 assert.equal(state.commands.length, 1);
 assert.equal(state.commands[0].label, 'verify');
 assert.equal(state.head, state.base);
 assert.equal(complete(f.plan, state, remote).outcome, 'PR_ACCEPTED');
 assert.throws(() => complete(f.plan, { ...state, phase: 'CANCELLED_RELEASED' }, remote));
 assert.throws(() => complete(f.plan, { ...state, commands: [] }, remote));
 assert.throws(() => complete(f.plan, state, { ...remote, base: f.head }));
}));
test('existing PR repair uses managed writer and a fresh independent reviewer without fake Issue', () => fixture(async f => {
 await f.stop();
 await f.call('repair', { evidence: 'reproducible failure within file scope' });
 const writer = await f.bind('writer', 'repair-writer');
 await f.call('write', { path: 'file', content: 'fixed' }, writer.cap);
 await f.command(writer, 'commit'); await f.command(writer, 'verify');
 const message = f.git(f.cwd, 'show', '-s', '--format=%B', 'HEAD');
 assert.doesNotMatch(message, /CF-Pages-Skip|Refs #null|Refs #undefined/);
 await f.stop(); await f.call('seal-writer'); await f.review();
 const remote = await f.remote(); await f.call('release');
 assert.equal(complete(f.plan, await f.archive(), remote).outcome, 'PR_UPDATED');
}));
test('merge uncertainty retains lease and production must use actual ordinary merge SHA', () => fixture(async f => {
 await f.review();
 const snapshot = { ...work.target, ...await f.remote(), number: 20, state: 'OPEN', mergeable: true, unresolved: 0, reviewDecision: null, checksComplete: true, requiredChecks: ['verify'], checks: [{ name: 'verify', conclusion: 'success', head: mergeSha, source: 'GitHub' }], ciMergeSha: mergeSha, acceptance: { head: f.head, base: f.base, passed: true, evidence: 'independent domain acceptance' } };
 await f.call('merge-intent', snapshot);
 assert.equal((await inspect(f.cwd)).shipping.intent.expected_head_sha, f.head);
 await assert.rejects(f.call('merge-intent', snapshot), /reconciled/);
 await assert.rejects(f.call('request-stop'), /reconciled/);
 await assert.rejects(f.call('release'), /release evidence/);
 await assert.rejects(acquire(f.cwd, f.plan.acquire), /EEXIST/);
 await assert.rejects(f.call('record-merge', { outcome: 'unknown' }), /official merge/);
 const actualMergeSha = 'd'.repeat(40);
 await assert.rejects(f.call('record-merge', { outcome: 'merged', head: f.head, base: f.base, url: target.url, sha: actualMergeSha, parents: [f.head], source: 'GitHub', observedAt: Date.now() }), /ordinary merge/);
 await f.call('record-merge', { outcome: 'merged', head: f.head, base: f.base, url: target.url, sha: actualMergeSha, parents: [f.base, f.head], source: 'GitHub merge response and commit read', observedAt: Date.now() });
 const deployment = { sha: actualMergeSha, environment: 'production', status: 'pending', provider: 'Cloudflare', id: 'deployment', url: 'https://example.invalid', source: 'provider API', observedAt: Date.now() };
 await assert.rejects(f.call('record-deployment', { ...deployment, sha: mergeSha }), /actual merged SHA/);
 await assert.rejects(f.call('record-deployment', { ...deployment, environment: 'preview' }), /actual merged SHA/);
 await f.call('record-deployment', deployment);
 await assert.rejects(f.call('record-deployment', { ...deployment, status: 'success' }), /production build/);
 const at = Date.now();
 const observation = { ...deployment, status: 'success', build: 'success', observedAt: at, regression: { passed: true, sha: actualMergeSha, environment: 'production', source: 'real live regression', observedAt: at } };
 await f.call('record-deployment', observation);
 const remote = { ...await f.remote(), merged: true, actualMergeSha, production: observation };
 await f.call('release');
 assert.equal(complete(f.plan, await f.archive(), remote).outcome, 'DEPLOYED');
 const saved = await f.archive();
 assert.throws(() => complete(f.plan, saved, { ...remote, actualMergeSha: mergeSha }));
}));
test('official merge denial is retained, cannot retry, and reports blocked rather than success', () => fixture(async f => {
 await f.review();
 const snapshot = { ...target, ...await f.remote(), state: 'OPEN', mergeable: true, unresolved: 0, reviewDecision: null, checksComplete: true, requiredChecks: ['verify'], checks: [{ name: 'verify', conclusion: 'success', head: mergeSha, source: 'GitHub' }], ciMergeSha: mergeSha, acceptance: { head: f.head, base: f.base, passed: true, evidence: 'acceptance' } };
 await f.call('merge-intent', snapshot);
 await f.call('record-merge', { outcome: 'denied', head: f.head, base: f.base, url: target.url, sha: null, source: 'official permission denial', observedAt: Date.now() });
 await assert.rejects(f.call('merge-intent', snapshot), /reconciled/);
 const remote = await f.remote(); await f.call('release');
 assert.equal(complete(f.plan, await f.archive(), remote).outcome, 'MERGE_BLOCKED');
}));

test('known merge releases locally as pending and a new observer cannot reuse or mutate the old lease', () => fixture(async f => {
 await f.review();
 const snapshot = { ...target, ...await f.remote(), state: 'OPEN', mergeable: true, unresolved: 0, reviewDecision: null, checksComplete: true, requiredChecks: ['verify'], checks: [{ name: 'verify', conclusion: 'success', head: mergeSha, source: 'GitHub' }], ciMergeSha: mergeSha, acceptance: { head: f.head, base: f.base, passed: true, evidence: 'acceptance' } };
 await f.call('merge-intent', snapshot);
 const actualMergeSha = 'e'.repeat(40);
 await f.call('record-merge', { outcome: 'merged', head: f.head, base: f.base, url: target.url, sha: actualMergeSha, parents: [f.base, f.head], source: 'official merge result', observedAt: Date.now() });
 const remote = { ...await f.remote(), merged: true, actualMergeSha };
 await f.call('release');
 const archive = await f.archive();
 assert.equal(complete(f.plan, archive, remote).outcome, 'DEPLOYMENT_PENDING');
 const future = f.plan.deadline + 60000;
 const production = { sha: actualMergeSha, environment: 'production', status: 'success', build: 'success', provider: 'Cloudflare', id: 'deployment', url: 'https://example.invalid', source: 'fresh provider read', observedAt: future, regression: { passed: true, sha: actualMergeSha, environment: 'production', source: 'live test', observedAt: future } };
 const evidence = { ...remote, observedAt: future, production, observer: { id: 'new-coordinator', source: 'native host identity', observedAt: future } };
 const result = observeDeployment(f.plan, archive, evidence, future);
 assert.equal(result.status, 'OBSERVED'); assert.equal(result.outcome, 'DEPLOYED'); assert.equal(result.originEpoch, archive.epoch); assert.equal(result.observer.id, 'new-coordinator');
 assert.equal((await f.archive()).deadline, archive.deadline);
 for (const patch of [{ observer: null }, { production: { ...production, sha: mergeSha } }, { production: { ...production, environment: 'preview' } }, { production: { ...production, regression: null } }, { actualMergeSha: mergeSha }]) assert.throws(() => observeDeployment(f.plan, archive, { ...evidence, ...patch }, future));
 const successor = await acquire(f.cwd, { ...f.plan.acquire, owner: 'new-owner', timeoutMs: 10000 });
 assert.notEqual(successor.epoch, archive.epoch);
 observeDeployment(f.plan, archive, evidence, future);
 assert.equal((await inspect(f.cwd)).epoch, successor.epoch);
 await assert.rejects(transition(f.cwd, { ...f.cap, expected_revision: 0, operation_id: 'old-owner-write', action: 'repair', data: { evidence: 'cannot reuse old lease' } }), /stale epoch/);
}));

test('review-only publication grant cannot become a repair writer', () => fixture(async f => {
 await f.stop();
 await assert.rejects(f.call('repair', { evidence: 'needs a patch' }), /repair budget/);
 await f.review();
 const remote = await f.remote(); await f.call('release');
 assert.equal(complete(f.plan, await f.archive(), remote).outcome, 'PR_ACCEPTED');
}, { publish: false }));

test('empty Issue-free implementation cannot seal or succeed and remains cancellable', () => fixture(async f => {
 assert.equal((await inspect(f.cwd)).phase, 'ACTIVE');
 await f.stop();
 await assert.rejects(f.call('seal-writer'), /managed writer commit/);
 const empty = await inspect(f.cwd);
 await f.call('request-stop');
 await f.stop();
 const current = await inspect(f.cwd);
 const binding = { epoch: current.epoch, revision: current.revision, cwd: current.cwd, common: f.git(f.cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir'), branch: current.branch, base: current.base, head: current.head, paths: current.paths, observedHead: f.head, tree: f.git(f.cwd, 'rev-parse', 'HEAD^{tree}'), parents: [f.base] };
 await f.call('cancel-release', { binding, mode: 'supervisor-evidence', reason: 'test empty implementation cancellation', codeVersion: f.head });
 assert.equal(empty.phase, 'QUIESCENT');
 assert.throws(() => complete(f.plan, { ...current, phase: 'CANCELLED_RELEASED' }, {}));
}, { existing: false }));

test('new implementation runs Issue-free managed commit and independent acceptance', () => fixture(async f => {
 const writer = await f.bind('writer', 'implementation-writer');
 await f.call('write', { path: 'file', content: 'implemented' }, writer.cap);
 await f.command(writer, 'commit'); await f.command(writer, 'verify');
 await f.stop(); await f.call('seal-writer'); await f.review();
 const remote = await f.remote(); await f.call('release');
 assert.equal(complete(f.plan, await f.archive(), remote).outcome, 'DRAFT_READY');
}, { existing: false }));
