import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, realpath, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { acquire, transition, inspect, checkedPath } from '../scripts/loop-a-lifecycle.mjs';
test('lifecycle excludes other worktrees, enforces CAS, capability and replay', async () => {
  const root = await mkdtemp(join(tmpdir(), 'slidelatch-lease-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  try {
    git('init'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Fixture');
    await writeFile(join(root, 'file'), 'base'); git('add', '.'); git('commit', '-m', 'base');
    git('worktree', 'add', '-b', 'writer', join(root, 'writer'));
    git('worktree', 'add', '-b', 'other', join(root, 'other'));
    const cwd = join(root, 'writer');
    const input = { issue: 11, authorization: 'test fixture', owner: 'test', paths: ['file'] };
    const cap = await acquire(cwd, input);
    await assert.rejects(acquire(join(root, 'other'), input), /EEXIST/);
    const req = { ...cap, expected_revision: 0, operation_id: 'intent', action: 'dispatch-intent', data: { role: 'writer' } };
    const result = await transition(cwd, req);
    assert.deepEqual(await transition(cwd, req), result);
    await assert.rejects(transition(cwd, { ...req, data: { role: 'reviewer' } }), /payload conflict/);
    await assert.rejects(transition(cwd, { ...req, operation_id: 'stale' }), /revision conflict/);
    await assert.rejects(transition(cwd, { ...req, epoch: 'stale' }), /stale epoch/);
    await assert.rejects(transition(cwd, { ...req, token: 'wrong' }), /capability/);
    assert.equal((await inspect(cwd)).actors.length, 1);
    await assert.rejects(checkedPath(cwd, '../file'), /unsafe/);
    await assert.rejects(checkedPath(cwd, '.git/config'), /unsafe/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), 'slidelatch-lifecycle-'));
  const g = (...a) => execFileSync('git', a, { cwd: root, stdio: 'pipe' });
  try {
    g('init'); g('config', 'user.email', 'fixture@example.invalid'); g('config', 'user.name', 'Fixture');
    await writeFile(join(root, 'file'), 'base'); await writeFile(join(root, 'package.json'), JSON.stringify({ scripts: { verify: 'node -e \"process.exit(0)\"' } })); g('add', '.'); g('commit', '-m', 'base');
    g('worktree', 'add', '-b', 'writer', join(root, 'writer'));
    await fn(join(root, 'writer'), root);
  } finally { await rm(root, { recursive: true, force: true }); }
}
const setup = async cwd => acquire(cwd, { issue: 11, authorization: 'fixture', owner: 'coordinator', paths: ['file'] });
const call = async (cwd, cap, action, data = {}, id = crypto.randomUUID()) => transition(cap.cwd ?? cwd, { ...cap, expected_revision: (await inspect(cwd)).revision, operation_id: id, action, data });
async function verifyReviewer(cwd, cap) {
  const { managedCommand } = await import('../scripts/loop-a-lifecycle.mjs');
  await managedCommand(cap.cwd, { ...cap, expected_revision: (await inspect(cwd)).revision, operation_id: crypto.randomUUID(), data: { label: 'verify' } });
}
async function bind(cwd, cap, role, id) {
  await call(cwd, cap, 'dispatch-intent', { role });
  const a = (await inspect(cwd)).actors.at(-1);
  const token = crypto.randomUUID();
  let worktree = cwd;
  if (role === 'reviewer') { worktree = join(cwd, '..', `review-${crypto.randomUUID()}`); execFileSync('git', ['worktree','add','--detach',worktree,'HEAD'], { cwd, stdio: 'pipe' }); }
  await call(cwd, cap, 'bind-actor', { intent: a.intent, id, capability: token, worktree });
  return { epoch: cap.epoch, token, cwd: worktree };
}
test('complete writer, independent reviewer, draft and CI lifecycle releases shared lock', () => fixture(async cwd => {
  const cap = await setup(cwd);
  const writer = await bind(cwd, cap, 'writer', 'native-writer');
  await assert.rejects(call(cwd, cap, 'dispatch-intent', { role: 'writer' }), /active actor/);
  const originalHead = (await inspect(cwd)).head;
  await call(cwd, writer, 'write', { path: 'file', content: 'actual writer change' });
  const { managedCommand } = await import('../scripts/loop-a-lifecycle.mjs');
  for (const label of ['commit','verify']) await managedCommand(cwd, { ...writer, expected_revision: (await inspect(cwd)).revision, operation_id: `writer-${label}`, data: { label } });
  const committedHead = execFileSync('git', ['rev-parse','HEAD'], { cwd, encoding: 'utf8' }).trim();
  assert.notEqual(committedHead, originalHead);
  assert.equal((await inspect(cwd)).commands.at(-1).identity.head, committedHead);
  await call(cwd, cap, 'confirm-quiescent', { observations: ['native-writer'].map(id => ({ id, status: 'stop-acknowledged', noExternalProcesses: true, source: 'fixture actor acknowledgement', observedAt: Date.now() })) });
  await call(cwd, cap, 'seal-writer');
  assert.equal((await inspect(cwd)).head, committedHead);
  await call(cwd, cap, 'dispatch-intent', { role: 'reviewer' });
  const intent = (await inspect(cwd)).actors.at(-1).intent;
  await assert.rejects(call(cwd, cap, 'bind-actor', { intent, id: 'native-writer', capability: crypto.randomUUID() }), /identity conflict/);
  const token = crypto.randomUUID();
  const reviewCwd = join(cwd, '..', 'reviewer');
  execFileSync('git', ['worktree','add','--detach',reviewCwd,'HEAD'], { cwd, stdio: 'pipe' });
  await call(cwd, cap, 'bind-actor', { intent, id: 'native-reviewer', capability: token, worktree: reviewCwd });
  const head = (await inspect(cwd)).head;
  await verifyReviewer(cwd, { epoch: cap.epoch, token, cwd: reviewCwd });
  await call(cwd, { epoch: cap.epoch, token, cwd: reviewCwd }, 'record-review', { head, passed: true, evidence: 'independent fixture review' });
  await call(cwd, cap, 'record-pr', { head, draft: true, url: 'https://github.com/example/repo/pull/1' });
  await call(cwd, cap, 'record-ci', { head, mergeSha: head, run: 'fixture-run', passed: true });
  await call(cwd, cap, 'confirm-quiescent', { observations: ['native-writer','native-reviewer'].map(id => ({ id, status: 'stop-acknowledged', noExternalProcesses: true, source: 'fixture actor acknowledgement', observedAt: Date.now() })) });
  const request = { ...cap, expected_revision: (await inspect(cwd)).revision, operation_id: 'release', action: 'release', data: {} };
  const released = await transition(cwd, request);
  assert.equal(released.phase, 'RELEASED');
  assert.deepEqual(await transition(cwd, request), released);
  const nextLease = await setup(cwd);
  assert.deepEqual(await transition(cwd, request), released);
  assert.equal((await inspect(cwd)).epoch, nextLease.epoch);
}));
test('unbound spawn and pending command cannot be declared quiescent', () => fixture(async cwd => {
  const cap = await setup(cwd);
  await call(cwd, cap, 'dispatch-intent', { role: 'writer' });
  await assert.rejects(call(cwd, cap, 'confirm-quiescent', { observations: [].map(id => ({ id, status: 'stop-acknowledged', noExternalProcesses: true, source: 'fixture actor acknowledgement', observedAt: Date.now() })) }), /positive actor/);
  await assert.rejects(setup(cwd), /EEXIST/);
}));
test('managed command records actual process exit and cannot run unknown labels', () => fixture(async cwd => {
  const { managedCommand } = await import('../scripts/loop-a-lifecycle.mjs');
  const cap = await setup(cwd);
  const writer = await bind(cwd, cap, 'writer', 'writer');
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ scripts: { verify: 'node -e "process.exit(0)"' } }));
  const request = { ...writer, expected_revision: (await inspect(cwd)).revision, operation_id: 'verify-command', data: { label: 'verify' } };
  await managedCommand(cwd, request);
  const c = (await inspect(cwd)).commands[0];
  assert.equal(c.status, 'EXITED'); assert.equal(c.exit.code, 0); assert(c.exit.pid > 0); assert(c.exit.groupGone);
  await assert.rejects(managedCommand(cwd, { ...request, data: { label: 'shell' } }), /unknown/);
}));
test('corrupt state fails closed and never removes lock', () => fixture(async (cwd, root) => {
  await setup(cwd);
  await writeFile(join(root, '.git/loop-a/lock/state.json'), '{');
  await assert.rejects(inspect(cwd));
  await assert.rejects(setup(cwd), /EEXIST/);
}));
test('deadline stops new work without releasing lease', () => fixture(async (cwd, root) => {
  const cap = await acquire(cwd, { issue: 11, owner: 'fixture', authorization: 'fixture', paths: ['file'], timeoutMs: 1 });
  await new Promise(r => setTimeout(r, 10));
  await assert.rejects(call(cwd, cap, 'dispatch-intent', { role: 'writer' }), /deadline/);
  assert.equal((await inspect(cwd)).phase, 'STOPPING');
  await assert.rejects(setup(cwd), /EEXIST/);
}));
test('changed HEAD invalidates acceptance before PR recording', () => fixture(async cwd => {
  const cap = await setup(cwd);
  await call(cwd, cap, 'confirm-quiescent', { observations: [].map(id => ({ id, status: 'stop-acknowledged', noExternalProcesses: true, source: 'fixture actor acknowledgement', observedAt: Date.now() })) });
  await call(cwd, cap, 'seal-writer');
  const reviewer = await bind(cwd, cap, 'reviewer', 'reviewer');
  const head = (await inspect(cwd)).head;
  await verifyReviewer(cwd, reviewer);
  await call(cwd, reviewer, 'record-review', { head, passed: true, evidence: 'review fixture' });
  execFileSync('git', ['commit','--allow-empty','-m','changed'], { cwd, stdio: 'pipe' });
  await assert.rejects(call(cwd, cap, 'record-pr', { head, draft: true, url: 'https://github.com/example/repo/pull/1' }), /head changed/);
  const s = await inspect(cwd); assert.equal(s.review, null); assert.equal(s.phase, 'BLOCKED_UNCERTAIN');
}));
test('symlink path and unknown state schema are rejected', () => fixture(async (cwd, root) => {
  const { symlink, readFile } = await import('node:fs/promises');
  await symlink(root, join(cwd, 'escape'));
  await assert.rejects(checkedPath(cwd, 'escape/file'), /symlink/);
  await setup(cwd);
  const path = join(root, '.git/loop-a/lock/state.json');
  const s = JSON.parse(await readFile(path, 'utf8')); s.unknown = true;
  await writeFile(path, JSON.stringify(s)); await assert.rejects(inspect(cwd), /unknown state/);
}));
test('second identical repair evidence pauses while retaining lock', () => fixture(async cwd => {
  const cap = await setup(cwd);
  for (let i = 0; i < 2; i++) {
    await call(cwd, cap, 'confirm-quiescent', { observations: [].map(id => ({ id, status: 'stop-acknowledged', noExternalProcesses: true, source: 'fixture actor acknowledgement', observedAt: Date.now() })) });
    await call(cwd, cap, 'seal-writer');
    await call(cwd, cap, 'repair', { evidence: 'same blocker' });
  }
  assert.equal((await inspect(cwd)).phase, 'BLOCKED_UNCERTAIN');
  await assert.rejects(setup(cwd), /EEXIST/);
}));
test('phase1 inspection shares lifecycle lock', () => fixture(async cwd => {
  const { round } = await import('../scripts/loop-a-round.mjs');
  await setup(cwd);
  assert.equal((await round({ cwd })).status, 'busy');
}));
test('deadline supervisor stops only its live process group and retains lease', () => fixture(async cwd => {
  const { managedCommand } = await import('../scripts/loop-a-lifecycle.mjs');
  const cap = await acquire(cwd, { issue: 11, owner: 'fixture', authorization: 'fixture', paths: ['file'], timeoutMs: 1800 });
  const writer = await bind(cwd, cap, 'writer', 'writer');
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ scripts: { verify: 'node -e "setInterval(()=>{},1000)"' } }));
  await managedCommand(cwd, { ...writer, expected_revision: (await inspect(cwd)).revision, operation_id: 'deadline-command', data: { label: 'verify' } });
  const s = await inspect(cwd);
  assert(s.commands[0].exit.signal || s.commands[0].exit.code !== 0);
  assert.equal(s.commands[0].status, 'EXITED');
  await assert.rejects(setup(cwd), /EEXIST/);
}));
test('supervisor observes a delayed group exit without signalling after leader exit', t => fixture(async cwd => {
  const { managedCommand } = await import('../scripts/loop-a-lifecycle.mjs');
  await writeFile(join(cwd, 'verify.cjs'), `process.on('SIGTERM', () => setTimeout(() => process.exit(0), 150)); setInterval(() => {}, 1000);`);
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ scripts: { verify: 'node verify.cjs' } }));
  const cap = await acquire(cwd, { issue: 17, owner: 'fixture', authorization: 'fixture', paths: ['file'], timeoutMs: 1800 });
  const writer = await bind(cwd, cap, 'writer', 'writer');
  const deadline = (await inspect(cwd)).deadline;
  const kill = process.kill.bind(process);
  let observed = false, observedExistingGroup = false;
  t.mock.method(process, 'kill', (pid, signal) => {
    if (observed) assert.equal(signal, 0, 'leader exit must end authority to send signals');
    if (signal === 0) observed = true;
    const result = kill(pid, signal);
    if (signal === 0) observedExistingGroup = true;
    return result;
  });
  try {
    await managedCommand(cwd, { ...writer, expected_revision: (await inspect(cwd)).revision, operation_id: 'delayed-exit', data: { label: 'verify' } });
    const s = await inspect(cwd);
    assert(observedExistingGroup, 'fixture must exercise a group still present after leader exit');
    assert.equal(s.commands[0].status, 'EXITED');
    assert.equal(s.commands[0].exit.groupGone, true);
    assert.equal(s.deadline, deadline);
    await assert.rejects(setup(cwd), /EEXIST/);
  } finally {
    // Only this synthetic descendant self-exits; never signal a numeric PID after leader exit.
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}));

for (const observation of ['present', 'EPERM', 'EIO']) {
  test(`supervisor retains lease when group observation remains ${observation}`, t => fixture(async cwd => {
    const { managedCommand } = await import('../scripts/loop-a-lifecycle.mjs');
    const cap = await setup(cwd); const writer = await bind(cwd, cap, 'writer', 'writer');
    let probes = 0;
    t.mock.method(process, 'kill', (pid, signal) => {
      assert(pid < 0); assert.equal(signal, 0, 'an exited leader never authorizes a signal');
      probes++;
      if (observation !== 'present') throw Object.assign(new Error('synthetic observation failure'), { code: observation });
      return true;
    });
    const start = performance.now();
    await managedCommand(cwd, { ...writer, expected_revision: (await inspect(cwd)).revision, operation_id: `group-${observation}`, data: { label: 'verify' } });
    assert(performance.now() - start < 5000, 'observation must have a bounded budget');
    assert(probes > 0 && probes <= 50, 'observation cannot poll indefinitely');
    const s = await inspect(cwd);
    assert.equal(s.commands[0].status, 'UNCERTAIN');
    assert.equal(s.commands[0].exit.groupGone, false);
    assert.equal(s.phase, 'BLOCKED_UNCERTAIN');
    await assert.rejects(call(cwd, cap, 'confirm-quiescent', { observations: [{ id: 'writer', status: 'stop-acknowledged', noExternalProcesses: true, source: 'synthetic fixture', observedAt: Date.now() }] }), /positive actor/);
    await assert.rejects(setup(cwd), /EEXIST/);
  }));
}
test('worker cannot forge supervisor exit, and inspect exposes no supervisor nonce', () => fixture(async cwd => {
  const cap = await setup(cwd); const writer = await bind(cwd, cap, 'writer', 'writer');
  await assert.rejects(call(cwd, writer, 'command-intent', { label: 'verify', nonce: 'forged' }), /supervisor-only/);
  await assert.rejects(call(cwd, writer, 'command-exit', { id: 'fake', nonce: 'fake', evidence: { pid: 1, started: 1, groupGone: true, code: 0 } }), /supervisor-only/);
  assert(!JSON.stringify(await inspect(cwd)).includes('capability'));
}));
test('hardlinks cannot mutate files outside the approved worktree', () => fixture(async (cwd, root) => {
  const { link, readFile } = await import('node:fs/promises');
  const cap = await setup(cwd); const writer = await bind(cwd, cap, 'writer', 'writer');
  await rm(join(cwd, 'file')); await link(join(root, 'file'), join(cwd, 'file'));
  await assert.rejects(call(cwd, writer, 'write', { path: 'file', content: 'escaped' }), /hardlink/);
  assert.equal(await readFile(join(root, 'file'), 'utf8'), 'base');
}));
test('native completed alone is not positive stop evidence', () => fixture(async cwd => {
  const cap = await setup(cwd); await bind(cwd, cap, 'writer', 'writer');
  await assert.rejects(call(cwd, cap, 'confirm-quiescent', { stopped_ids: ['writer'], evidence: 'native completed' }), /positive actor/);
  await assert.rejects(call(cwd, cap, 'confirm-quiescent', { observations: [{ id: 'writer', status: 'completed', noExternalProcesses: true, source: 'native status', observedAt: Date.now() }] }), /positive actor/);
}));
test('independent reviewer runs managed verify but cannot write source or commit', () => fixture(async cwd => {
  const { managedCommand } = await import('../scripts/loop-a-lifecycle.mjs');
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ scripts: { verify: 'node -e "process.exit(0)"' } }));
  execFileSync('git', ['add','package.json'], { cwd }); execFileSync('git', ['commit','--allow-empty','-m','fixture command'], { cwd, stdio: 'pipe' });
  const cap = await setup(cwd);
  await call(cwd, cap, 'confirm-quiescent', { observations: [] }); await call(cwd, cap, 'seal-writer');
  const reviewer = await bind(cwd, cap, 'reviewer', 'reviewer');
  await managedCommand(reviewer.cwd, { ...reviewer, expected_revision: (await inspect(cwd)).revision, operation_id: 'review-verify', data: { label: 'verify' } });
  assert.equal((await inspect(cwd)).commands[0].exit.code, 0);
  assert(!JSON.stringify((await inspect(cwd)).commands).includes('nonce'));
  await assert.rejects(call(cwd, reviewer, 'write', { path: 'file', content: 'bad' }), /forbidden/);
  await assert.rejects(managedCommand(reviewer.cwd, { ...reviewer, expected_revision: (await inspect(cwd)).revision, operation_id: 'review-commit', data: { label: 'commit' } }), /forbidden/);
}));
test('persisted pending mutation refuses replay and retains lease', () => fixture(async (cwd, root) => {
  const { readFile } = await import('node:fs/promises');
  const cap = await setup(cwd); const writer = await bind(cwd, cap, 'writer', 'writer');
  const path = join(root, '.git/loop-a/lock/state.json'); const state = JSON.parse(await readFile(path, 'utf8'));
  state.mutation = { operation: 'crashed-write', path: 'file', status: 'PENDING', contentHash: 'a'.repeat(64) };
  await writeFile(path, JSON.stringify(state));
  await assert.rejects(call(cwd, writer, 'write', { path: 'file', content: 'base' }, 'crashed-write'), /pending mutation/);
  await assert.rejects(setup(cwd), /EEXIST/);
}));
test('review gate rejects missing verify and dirty review checkout', () => fixture(async cwd => {
  const cap = await setup(cwd);
  await call(cwd, cap, 'confirm-quiescent', { observations: [] }); await call(cwd, cap, 'seal-writer');
  const reviewer = await bind(cwd, cap, 'reviewer', 'reviewer'); const head = (await inspect(cwd)).head;
  await assert.rejects(call(cwd, reviewer, 'record-review', { head, passed: true, evidence: 'claimed' }), /reviewer verify/);
  await verifyReviewer(cwd, reviewer);
  await writeFile(join(reviewer.cwd, 'file'), 'uncommitted');
  await assert.rejects(call(cwd, reviewer, 'record-review', { head, passed: true, evidence: 'claimed' }), /reviewer verify/);
}));
test('review gate rejects actual failing verify', () => fixture(async cwd => {
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ scripts: { verify: 'node -e "process.exit(2)"' } }));
  execFileSync('git', ['add','package.json'], { cwd }); execFileSync('git', ['commit','-m','failing fixture'], { cwd, stdio: 'pipe' });
  const cap = await setup(cwd); await call(cwd, cap, 'confirm-quiescent', { observations: [] }); await call(cwd, cap, 'seal-writer');
  const reviewer = await bind(cwd, cap, 'reviewer', 'reviewer'); const head = (await inspect(cwd)).head;
  await verifyReviewer(cwd, reviewer);
  assert.equal((await inspect(cwd)).commands.at(-1).exit.code, 2);
  await assert.rejects(call(cwd, reviewer, 'record-review', { head, passed: true, evidence: 'claimed' }), /reviewer verify/);
}));
test('managed commands discard caller NODE_OPTIONS and PATH injection', () => fixture(async cwd => {
  const cap = await setup(cwd); const writer = await bind(cwd, cap, 'writer', 'writer');
  const { managedCommand } = await import('../scripts/loop-a-lifecycle.mjs');
  const options = process.env.NODE_OPTIONS, path = process.env.PATH;
  try {
    process.env.NODE_OPTIONS = '--require=/definitely/not/a/module'; process.env.PATH = '/definitely/not/a/path';
    await managedCommand(cwd, { ...writer, expected_revision: (await inspect(cwd)).revision, operation_id: 'clean-env', data: { label: 'verify' } });
    assert.equal((await inspect(cwd)).commands.at(-1).exit.code, 0);
  } finally {
    if (options === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = options;
    process.env.PATH = path;
  }
}));
test('command replay returns prior observed outcome without respawning', () => fixture(async cwd => {
  const { managedCommand } = await import('../scripts/loop-a-lifecycle.mjs');
  const cap = await setup(cwd); const writer = await bind(cwd, cap, 'writer', 'writer');
  const request = { ...writer, expected_revision: (await inspect(cwd)).revision, operation_id: 'replayed-command', data: { label: 'verify' } };
  const result = await managedCommand(cwd, request);
  assert.deepEqual(await managedCommand(cwd, request), result);
  assert.equal((await inspect(cwd)).commands.length, 1);
}));
test('leader exit with living descendant is uncertain and cannot release', () => fixture(async cwd => {
  const { managedCommand } = await import('../scripts/loop-a-lifecycle.mjs');
  await writeFile(join(cwd, 'verify.cjs'), `const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e','setTimeout(()=>{},2500)'],{stdio:'ignore'}); child.unref();`);
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ scripts: { verify: 'node verify.cjs' } }));
  const cap = await setup(cwd); const writer = await bind(cwd, cap, 'writer', 'writer');
  await managedCommand(cwd, { ...writer, expected_revision: (await inspect(cwd)).revision, operation_id: 'descendant', data: { label: 'verify' } });
  const s = await inspect(cwd); assert.equal(s.commands.at(-1).status, 'UNCERTAIN'); assert.equal(s.phase, 'BLOCKED_UNCERTAIN');
  await assert.rejects(call(cwd, cap, 'confirm-quiescent', { observations: [{ id: 'writer', status: 'stop-acknowledged', noExternalProcesses: true, source: 'fixture', observedAt: Date.now() }] }), /positive actor/);
  await new Promise(resolve => setTimeout(resolve, 2600)); // Fixture descendant self-exits; no reused PID is signalled.
  await assert.rejects(setup(cwd), /EEXIST/);
}));

test('coordinator revokes stopped capability before replay authentication', () => fixture(async cwd => {
  const cap = await setup(cwd);
  const writer = await bind(cwd, cap, 'writer', 'writer');
  const request = { ...writer, expected_revision: (await inspect(cwd)).revision, operation_id: 'written', action: 'write', data: { path: 'file', content: 'base' } };
  await transition(cwd, request);
  await assert.rejects(call(cwd, cap, 'revoke-actor', { actor: 'writer', reason: 'fixture' }), /quiescent/);
  await call(cwd, cap, 'request-stop');
  await call(cwd, cap, 'confirm-quiescent', { observations: [{ id: 'writer', status: 'stop-acknowledged', noExternalProcesses: true, source: 'synthetic fixture', observedAt: Date.now() }] });
  await assert.rejects(call(cwd, writer, 'revoke-actor', { actor: 'writer', reason: 'fixture' }), /coordinator/);
  await call(cwd, cap, 'revoke-actor', { actor: 'writer', reason: 'fixture' }, 'revoked');
  await assert.rejects(transition(cwd, request), /invalid capability/);
  await assert.rejects(call(cwd, writer, 'write', { path: 'file', content: 'forbidden' }), /invalid capability/);
  assert.deepEqual((await inspect(cwd)).authors, ['writer']);
  assert.equal((await inspect(cwd)).actors[0].id, 'writer');
}));

for (const defect of ['missing-command-proof', 'pending', 'uncertain', 'late-command', 'unknown-actor', 'mutation']) {
  test(`revocation retains lock with ${defect}`, () => fixture(async (cwd, root) => {
    const cap = await setup(cwd);
    const writer = await bind(cwd, cap, 'writer', 'writer');
    const { managedCommand } = await import('../scripts/loop-a-lifecycle.mjs');
    await managedCommand(cwd, { ...writer, expected_revision: (await inspect(cwd)).revision, operation_id: 'verified', data: { label: 'verify' } });
    await call(cwd, cap, 'request-stop');
    await call(cwd, cap, 'confirm-quiescent', { observations: [{ id: 'writer', status: 'stop-acknowledged', noExternalProcesses: true, source: 'synthetic fixture', observedAt: Date.now() }] });
    const path = join(root, '.git', 'loop-a', 'lock', 'state.json');
    const state = JSON.parse(await readFile(path, 'utf8'));
    if (defect === 'missing-command-proof') state.stopEvidence.commandIds = [];
    if (defect === 'pending') state.commands[0].status = 'PENDING';
    if (defect === 'uncertain') state.commands[0].status = 'UNCERTAIN';
    if (defect === 'late-command') state.stopEvidence.observations[0].observedAt = state.commands[0].exit.ended - 1;
    if (defect === 'unknown-actor') state.actors.push({ intent: 'unknown', id: null, capability: null, role: 'reviewer', stopped: false, worktree: null, lastActivity: Date.now() });
    if (defect === 'mutation') state.mutation = { operation: 'unknown', path: 'file', contentHash: '0'.repeat(64), status: 'PENDING' };
    await writeFile(path, JSON.stringify(state));
    await assert.rejects(call(cwd, cap, 'revoke-actor', { actor: 'writer', reason: 'fixture' }), /stop evidence|mutation|invalid supervisor result/);
    assert.equal(JSON.parse(await readFile(path, 'utf8')).actors[0].capability, state.actors[0].capability);
    await assert.rejects(setup(cwd), /EEXIST/);
  }));
}

test('cancel archives original head and retries without touching successor lease', () => fixture(async (cwd, root) => {
  const cap = await setup(cwd);
  const writer = await bind(cwd, cap, 'writer', 'writer');
  const original = (await inspect(cwd)).head;
  await call(cwd, writer, 'write', { path: 'file', content: 'cancelled change' });
  const { managedCommand } = await import('../scripts/loop-a-lifecycle.mjs');
  await managedCommand(cwd, { ...writer, expected_revision: (await inspect(cwd)).revision, operation_id: 'commit', data: { label: 'commit' } });
  const earlierHead = (await inspect(cwd)).commands.at(-1).result.head;
  await call(cwd, writer, 'write', { path: 'file', content: 'second cancelled change' });
  for (const label of ['commit', 'verify']) await managedCommand(cwd, { ...writer, expected_revision: (await inspect(cwd)).revision, operation_id: `second-${label}`, data: { label } });
  await call(cwd, cap, 'request-stop');
  await call(cwd, cap, 'confirm-quiescent', { observations: [{ id: 'writer', status: 'stop-acknowledged', noExternalProcesses: true, source: 'fixture', observedAt: Date.now() }] });
  await call(cwd, cap, 'revoke-actor', { actor: 'writer', reason: 'fixture cancellation' });
  const s = await inspect(cwd);
  const g = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const binding = { epoch: s.epoch, revision: s.revision, cwd: s.cwd, common: await realpath(join(root, '.git')), branch: s.branch, base: s.base, head: s.head, paths: s.paths, observedHead: g('rev-parse', 'HEAD'), tree: g('rev-parse', 'HEAD^{tree}'), parents: g('show', '-s', '--format=%P', 'HEAD').split(' ') };
  const request = { ...cap, expected_revision: s.revision, operation_id: 'cancel', action: 'cancel-release', data: { binding, mode: 'supervisor-evidence', reason: 'synthetic cancellation', codeVersion: original } };
  for (const field of ['epoch', 'revision', 'cwd', 'common', 'branch', 'base', 'head', 'paths', 'observedHead', 'tree', 'parents']) {
    const changed = { ...binding, [field]: Array.isArray(binding[field]) ? ['wrong'] : field === 'revision' ? -1 : 'wrong' };
    await assert.rejects(transition(cwd, { ...request, data: { ...request.data, binding: changed } }), /binding mismatch|repository drift/);
  }
  const statePath = join(root, '.git', 'loop-a', 'lock', 'state.json');
  const saved = await readFile(statePath, 'utf8');
  const missing = JSON.parse(saved); missing.commands[0].result = null;
  await writeFile(statePath, JSON.stringify(missing));
  await assert.rejects(transition(cwd, request), /missing supervisor (commit|command) result/);
  await writeFile(statePath, saved);
  for (const rollbackHead of [original, earlierHead]) {
  g('reset', '--hard', rollbackHead);
  const rollback = { ...binding, observedHead: g('rev-parse', 'HEAD'), tree: g('rev-parse', 'HEAD^{tree}'), parents: g('show', '-s', '--format=%P', 'HEAD').split(' ').filter(Boolean) };
  await assert.rejects(transition(cwd, { ...request, data: { ...request.data, binding: rollback } }), /final supervisor result/);
  assert.equal(await readFile(statePath, 'utf8'), saved);
  }
  g('reset', '--hard', binding.observedHead);
  const controlDirectory = join(root, '.git', 'loop-a');
  await chmod(controlDirectory, 0o500);
  try { await assert.rejects(transition(cwd, request), /EACCES|EPERM/); }
  finally { await chmod(controlDirectory, 0o700); }
  const retained = JSON.parse(await readFile(join(controlDirectory, 'lock', 'state.json'), 'utf8'));
  assert.equal(retained.phase, 'CANCELLED_RELEASED');
  await assert.rejects(setup(cwd), /EEXIST/);
  const result = await transition(cwd, request);
  assert.equal(result.phase, 'CANCELLED_RELEASED');
  const archive = JSON.parse(await readFile(join(root, '.git', 'loop-a', `cancelled-${cap.epoch}`, 'state.json'), 'utf8'));
  assert.equal(archive.head, original);
  assert.equal(archive.cancellation.binding.observedHead, binding.observedHead);
  assert.deepEqual(await transition(cwd, request), result);
  const successor = await setup(cwd);
  assert.deepEqual(await transition(cwd, request), result);
  assert.equal((await inspect(cwd)).epoch, successor.epoch);
  await assert.rejects(transition(cwd, { ...request, token: writer.token }), /invalid capability/);
}));

test('legacy cancellation requires separately bound independent audit', () => fixture(async (cwd, root) => {
  const cap = await setup(cwd);
  await call(cwd, cap, 'request-stop');
  await call(cwd, cap, 'confirm-quiescent', { observations: [] });
  const path = join(root, '.git', 'loop-a', 'lock', 'state.json');
  const legacy = JSON.parse(await readFile(path, 'utf8'));
  legacy.version = 1; delete legacy.cancellation;
  await writeFile(path, JSON.stringify(legacy));
  const g = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const binding = { epoch: legacy.epoch, revision: legacy.revision, cwd: legacy.cwd, common: await realpath(join(root, '.git')), branch: legacy.branch, base: legacy.base, head: legacy.head, paths: legacy.paths, observedHead: legacy.head, tree: g('rev-parse', 'HEAD^{tree}'), parents: [] };
  const request = { ...cap, expected_revision: legacy.revision, operation_id: 'legacy-cancel', action: 'cancel-release', data: { binding, mode: 'legacy-audited', reason: 'fixture', codeVersion: legacy.head } };
  await assert.rejects(transition(cwd, request), /independent legacy audit/);
  const audit = { reviewer: 'independent-fixture', authorization: 'fixture approval', source: 'fixture audit', observedAt: Date.now(), binding };
  const result = await transition(cwd, { ...request, data: { ...request.data, audit } });
  assert.equal(result.phase, 'CANCELLED_RELEASED');
  const archived = JSON.parse(await readFile(join(root, '.git', 'loop-a', `cancelled-${cap.epoch}`, 'state.json'), 'utf8'));
  assert.equal(archived.cancellation.validation, 'independent-reviewer-audit');
}));

test('worker binding returns no token and reserves an external opaque file', () => fixture(async cwd => {
  const { bindWorkerFile } = await import('../scripts/loop-a-lifecycle.mjs');
  const cap = await setup(cwd);
  await call(cwd, cap, 'dispatch-intent', { role: 'writer' });
  const state = await inspect(cwd);
  const request = { ...cap, expected_revision: state.revision, operation_id: 'opaque-bind', data: { intent: state.actors[0].intent, id: 'opaque-worker', worktree: cwd } };
  await assert.rejects(bindWorkerFile(cwd, request, join(cwd, 'capability.json')), /outside repository/);
  const external = await mkdtemp(join(tmpdir(), 'slidelatch-opaque-'));
  try {
    const output = join(external, 'worker.json');
    const result = await bindWorkerFile(cwd, request, output);
    const syntheticCapability = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(syntheticCapability.epoch, cap.epoch);
    assert.equal(JSON.stringify(result).includes(syntheticCapability.token), false);
    await assert.rejects(bindWorkerFile(cwd, request, output), /EEXIST/);
  } finally { await rm(external, { recursive: true, force: true }); }
}));
