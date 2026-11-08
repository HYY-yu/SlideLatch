import { realpath, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { checkedPath, acquire, inspect, transition } from './loop-a-lifecycle.mjs';
const requireValue = (v, message) => { if (!v) throw Error(message); };
const sha = v => /^[a-f0-9]{40}$/.test(v ?? '');
const git = (cwd, ...args) => execFileSync('/usr/bin/git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
export async function prepare(p, now = Date.now()) {
  requireValue(p?.version === 1 && p.repository === 'HYY-yu/SlideLatch' && Number.isSafeInteger(p.issue) && p.issue > 0, 'explicit repository and issue required');
  requireValue(p.authorization?.trim() && p.owner?.trim() && p.publish === true, 'explicit authorization required');
  requireValue(sha(p.entrySha) && sha(p.baseSha), 'exact SHA required');
  requireValue(Number.isSafeInteger(p.startedAt) && p.startedAt <= now && now < p.startedAt + 1200000 && p.maxRepairs === 2, 'invalid budget');
  const cwd = await realpath(p.worktree), entry = await realpath(p.entryRoot);
  const common = await realpath(resolve(cwd, git(cwd, 'rev-parse', '--git-common-dir')));
  requireValue(await realpath(resolve(entry, git(entry, 'rev-parse', '--git-common-dir'))) === common, 'entry and target repository differ');
  requireValue(/^(?:https:\/\/github\.com\/|git@github\.com:)HYY-yu\/SlideLatch(?:\.git)?$/.test(git(cwd, 'remote', 'get-url', 'origin')), 'repository origin mismatch');
  requireValue(cwd !== entry && await realpath(resolve(cwd, git(cwd, 'rev-parse', '--git-dir'))) !== common, 'independent worktree required');
  requireValue(git(entry, 'rev-parse', 'HEAD') === p.entrySha && !git(entry, 'status', '--porcelain'), 'entry identity mismatch');
  requireValue(git(cwd, 'rev-parse', 'HEAD') === p.baseSha && !git(cwd, 'status', '--porcelain') && p.branch && p.branch !== 'main' && git(cwd, 'branch', '--show-current') === p.branch, 'target identity mismatch');
  requireValue(Array.isArray(p.paths) && p.paths.length && new Set(p.paths).size === p.paths.length, 'exact paths required');
  for (const path of p.paths) { requireValue(!/[?*\[\]\\]/.test(path), 'glob forbidden'); await checkedPath(cwd, path); }
  return { ...p, worktree: cwd, entryRoot: entry, deadline: p.startedAt + 1200000, acquire: { issue: p.issue, authorization: p.authorization, owner: p.owner, paths: p.paths, timeoutMs: p.startedAt + 1200000 - now } };
}
// No business capability is handed off until this gate returns READY.
export async function admit(p, cap) {
  const s = await inspect(p.worktree);
  if (s.epoch === cap.epoch && s.phase === 'ACTIVE' && s.actors.length === 0 && s.commands.length === 0 && s.deadline <= p.deadline && Date.now() < p.deadline) return { status: 'READY', epoch: s.epoch, deadline: s.deadline };
  // Only an empty lease can be safely cancelled here. Unknown state retains its lock.
  if (s.epoch !== cap.epoch || s.actors.length || s.commands.length || s.mutation) throw Error('BLOCKED_UNCERTAIN: admission failed; lock retained');
  for (const [action, data] of [['request-stop', {}], ['confirm-quiescent', { observations: [] }]]) {
    const current = await inspect(p.worktree);
    await transition(p.worktree, { ...cap, expected_revision: current.revision, operation_id: `admission-${action}`, action, data });
  }
  const stopped = await inspect(p.worktree);
  const binding = { epoch: stopped.epoch, revision: stopped.revision, cwd: stopped.cwd, common: await realpath(resolve(p.worktree, git(p.worktree, 'rev-parse', '--git-common-dir'))), branch: stopped.branch, base: stopped.base, head: stopped.head, paths: stopped.paths, observedHead: git(p.worktree, 'rev-parse', 'HEAD'), tree: git(p.worktree, 'rev-parse', 'HEAD^{tree}'), parents: git(p.worktree, 'show', '-s', '--format=%P', 'HEAD').split(' ').filter(Boolean) };
  await transition(p.worktree, { ...cap, expected_revision: stopped.revision, operation_id: 'admission-cancel', action: 'cancel-release', data: { binding, mode: 'supervisor-evidence', reason: 'admission deadline exceeded before dispatch', codeVersion: p.entrySha } });
  throw Error('BLOCKED_DEADLINE: empty lease cancelled before dispatch');
}
export async function beginInvocation(file, input = {}, now = Date.now()) {
  const startedAt = input.startedAt ?? now;
  requireValue(Number.isSafeInteger(startedAt) && startedAt <= now && now < startedAt + 1200000 && typeof input.invocationId === 'string' && input.invocationId.length, 'valid invocation identity and original start required');
  const record = { version: 1, invocationId: input.invocationId, startedAt, recordedAt: now, timingSource: input.startedAt === undefined ? 'first-observable-entry' : 'caller-attested-dispatch-time' };
  await writeFile(file, JSON.stringify(record), { flag: 'wx', mode: 0o600 });
  return record;
}
export async function acquireOnce(input, capabilityFile) {
  requireValue(typeof input.invocationRecord === 'string', 'immutable invocation record required');
  const invocation = JSON.parse(await readFile(input.invocationRecord, 'utf8'));
  requireValue(invocation.version === 1 && invocation.invocationId === input.invocationId && invocation.startedAt === input.startedAt && invocation.recordedAt >= invocation.startedAt && invocation.recordedAt <= Date.now(), 'invocation budget mismatch');
  const p = await prepare(input);
  const timeoutMs = p.deadline - Date.now() - 1000;
  requireValue(timeoutMs > 0, 'insufficient remaining deadline');
  // Reserve output before acquiring: no overwrite and no capability in stdout.
  await writeFile(capabilityFile, '', { mode: 0o600, flag: 'wx' });
  const cap = await acquire(p.worktree, { ...p.acquire, timeoutMs });
  await writeFile(capabilityFile, JSON.stringify(cap), { mode: 0o600 });
  return admit(p, cap);
}
// This checks consistency, not authenticity. The host retrieves the original evidence.
export function complete(p, s, remote, now = Date.now()) {
  requireValue(now <= p.deadline && s.deadline <= p.deadline && Number.isInteger(s.repair) && s.repair >= 0 && s.repair <= p.maxRepairs, 'budget exceeded');
  requireValue(s.phase === 'RELEASED' && s.mutation === null && s.issue === p.issue && s.owner === p.owner && s.authorization === p.authorization && s.cwd === p.worktree && s.base === p.baseSha && s.branch === p.branch && JSON.stringify(s.paths) === JSON.stringify(p.paths), 'matching released round required');
  requireValue(sha(s.head) && s.head !== s.base && s.review?.passed === true && s.review.head === s.head && s.pr?.head === s.head && s.pr.draft === true && /^https:\/\/github\.com\/HYY-yu\/SlideLatch\/pull\/[1-9][0-9]*$/.test(s.pr.url) && s.ci?.head === s.head && s.ci.passed === true && sha(s.ci.mergeSha), 'complete new-head evidence required');
  requireValue(Array.isArray(s.actors) && s.actors.some(a => a.role === 'writer') && s.actors.some(a => a.role === 'reviewer' && a.id === s.review.actor && !s.authors.includes(a.id)) && new Set(s.actors.map(a => a.id)).size === s.actors.length, 'independent actors required');
  for (const a of s.actors) {
    requireValue(a.id && a.stopped && s.stopEvidence?.observations.some(o => o.id === a.id && o.status === 'stop-acknowledged' && o.noExternalProcesses === true && o.source && Number.isFinite(o.observedAt) && o.observedAt >= a.lastActivity && o.observedAt <= now), 'actor stop required');
  }
  for (const role of ['writer', 'reviewer']) {
    const c = s.commands.findLast(c => s.actors.some(a => a.id === c.actor && a.role === role && (role !== 'reviewer' || a.id === s.review.actor)) && c.label === 'verify');
    requireValue(c?.identity?.head === s.head && c.exit?.code === 0, 'latest exact-head verification required');
  }
  requireValue(s.commands.some(c => c.label === 'commit'), 'commit required');
  if (s.version === 2) {
    requireValue(s.commands.some(c => c.label === 'commit' && c.result?.head === s.head && c.result.epoch === s.epoch && c.result.operation === c.id && c.result.actor === c.actor), 'supervisor commit result required');
    for (const c of s.commands.filter(c => c.label === 'verify' && c.identity?.head === s.head)) requireValue(c.result?.head === s.head && c.result.epoch === s.epoch && c.result.operation === c.id && c.result.actor === c.actor, 'supervisor verify result required');
  }
  for (const c of s.commands) requireValue(s.stopEvidence.commandIds?.includes(c.id) && c.status === 'EXITED' && c.identity && c.exit && c.identity.pid === c.exit.pid && c.identity.started === c.exit.started && c.exit.groupGone === true && c.exit.ended >= c.identity.started, 'actual command exit required');
  requireValue(remote?.repository === p.repository && remote.issue === p.issue && remote.head === s.head && remote.draft === true && remote.url === s.pr.url && remote.run === s.ci.run && remote.mergeSha === s.ci.mergeSha && remote.passed === true && remote.source && Number.isFinite(remote.observedAt) && remote.observedAt >= s.stopEvidence.at && remote.observedAt <= now, 'fresh remote evidence required');
  return { status: 'RELEASED', validation: 'structural-only', head: s.head, pr: s.pr.url, run: s.ci.run };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv[2] === 'begin') { console.log(JSON.stringify(await beginInvocation(process.argv[4], JSON.parse(await readFile(process.argv[3], 'utf8'))))); }
    else if (process.argv[2] === 'acquire') { console.log(JSON.stringify(await acquireOnce(JSON.parse(await readFile(process.argv[3], 'utf8')), process.argv[4]))); } else {
    const args = await Promise.all(process.argv.slice(3).map(p => readFile(p, 'utf8').then(JSON.parse)));
    requireValue(['prepare', 'complete'].includes(process.argv[2]), 'use prepare input.json or complete plan.json archive.json remote.json');
    console.log(JSON.stringify(await (process.argv[2] === 'prepare' ? prepare(args[0]) : complete(...args)), null, 2));
    }
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
