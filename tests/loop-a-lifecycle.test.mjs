import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
    await writeFile(join(root, 'file'), 'base'); g('add', '.'); g('commit', '-m', 'base');
    g('worktree', 'add', '-b', 'writer', join(root, 'writer'));
    await fn(join(root, 'writer'), root);
  } finally { await rm(root, { recursive: true, force: true }); }
}
const setup = async cwd => acquire(cwd, { issue: 11, authorization: 'fixture', owner: 'coordinator', paths: ['file'] });
const call = async (cwd, cap, action, data = {}, id = crypto.randomUUID()) => transition(cwd, { ...cap, expected_revision: (await inspect(cwd)).revision, operation_id: id, action, data });
async function bind(cwd, cap, role, id) {
  await call(cwd, cap, 'dispatch-intent', { role });
  const a = (await inspect(cwd)).actors.at(-1);
  const token = crypto.randomUUID();
  await call(cwd, cap, 'bind-actor', { intent: a.intent, id, capability: token });
  return { epoch: cap.epoch, token };
}
test('complete writer, independent reviewer, draft and CI lifecycle releases shared lock', () => fixture(async cwd => {
  const cap = await setup(cwd);
  const writer = await bind(cwd, cap, 'writer', 'native-writer');
  await assert.rejects(call(cwd, cap, 'dispatch-intent', { role: 'writer' }), /active actor/);
  await call(cwd, writer, 'write', { path: 'file', content: 'base' });
  await call(cwd, cap, 'confirm-quiescent', { stopped_ids: ['native-writer'], evidence: 'writer acknowledged no further writes or external commands' });
  await call(cwd, cap, 'seal-writer');
  await call(cwd, cap, 'dispatch-intent', { role: 'reviewer' });
  const intent = (await inspect(cwd)).actors.at(-1).intent;
  await assert.rejects(call(cwd, cap, 'bind-actor', { intent, id: 'native-writer', capability: crypto.randomUUID() }), /identity conflict/);
  const token = crypto.randomUUID();
  await call(cwd, cap, 'bind-actor', { intent, id: 'native-reviewer', capability: token });
  const head = (await inspect(cwd)).head;
  await call(cwd, { epoch: cap.epoch, token }, 'record-review', { head, passed: true, evidence: 'independent fixture review' });
  await call(cwd, cap, 'record-pr', { head, draft: true, url: 'https://github.com/example/repo/pull/1' });
  await call(cwd, cap, 'record-ci', { head, mergeSha: head, run: 'fixture-run', passed: true });
  await call(cwd, cap, 'confirm-quiescent', { stopped_ids: ['native-writer','native-reviewer'], evidence: 'both acknowledged stopped' });
  const request = { ...cap, expected_revision: (await inspect(cwd)).revision, operation_id: 'release', action: 'release', data: {} };
  const released = await transition(cwd, request);
  assert.equal(released.phase, 'RELEASED');
  assert.deepEqual(await transition(cwd, request), released);
  await setup(cwd);
}));
test('unbound spawn and pending command cannot be declared quiescent', () => fixture(async cwd => {
  const cap = await setup(cwd);
  await call(cwd, cap, 'dispatch-intent', { role: 'writer' });
  await assert.rejects(call(cwd, cap, 'confirm-quiescent', { stopped_ids: [], evidence: 'unknown spawn' }), /positive actor/);
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
  await call(cwd, cap, 'confirm-quiescent', { stopped_ids: [], evidence: 'no actors' });
  await call(cwd, cap, 'seal-writer');
  const reviewer = await bind(cwd, cap, 'reviewer', 'reviewer');
  const head = (await inspect(cwd)).head;
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
    await call(cwd, cap, 'confirm-quiescent', { stopped_ids: [], evidence: 'no actors' });
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
