import { createHash } from 'node:crypto';
import { realpath, readFile, writeFile, mkdir, open } from 'node:fs/promises';
import { resolve, join, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { checkedPath, acquire, inspect, transition, validateWork } from './loop-a-lifecycle.mjs';
const requireValue = (v, message) => { if (!v) throw Error(message); };
const sha = v => /^[a-f0-9]{40}$/.test(v ?? '');
const git = (cwd, ...args) => execFileSync('/usr/bin/git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
export function selectWork({ prs = [], tasks = [] }) {
  const priority = ['failed-checks', 'review', 'merge'];
  const candidates = prs.filter(p => p.state === 'OPEN' && p.authorized === true && p.owner === null && p.coveredBy == null && priority.includes(p.priority));
  candidates.sort((a, b) => priority.indexOf(a.priority) - priority.indexOf(b.priority) || a.number - b.number);
  return candidates[0] ?? tasks.find(t => t.authorized === true && t.dependenciesAccepted === true && t.owner === null) ?? null;
}
export async function prepare(p, now = Date.now()) {
  requireValue([1, 2].includes(p?.version) && p.repository === 'HYY-yu/SlideLatch' && (p.version === 2 && p.issue == null || Number.isSafeInteger(p.issue) && p.issue > 0), 'explicit repository and issue required');
  requireValue(p.authorization?.trim() && p.owner?.trim() && (p.version === 2 && p.work?.kind === 'existing-pr' ? typeof p.publish === 'boolean' : p.publish === true), 'explicit authorization required');
  if (p.version === 2) validateWork(p.work, now);
  requireValue(sha(p.entrySha) && sha(p.baseSha), 'exact SHA required');
  requireValue(Number.isSafeInteger(p.startedAt) && p.startedAt <= now && now < p.startedAt + 1200000 && p.maxRepairs === 2, 'invalid budget');
  requireValue(typeof p.invocationId === 'string' && p.invocationId.trim(), 'invocation identity required');
  requireValue(typeof p.invocationRecord === 'string' && isAbsolute(p.invocationRecord), 'absolute immutable invocation record required');
  const invocation = JSON.parse(await readFile(p.invocationRecord, 'utf8'));
  requireValue(invocation.version === 1 && invocation.invocationId === p.invocationId && invocation.startedAt === p.startedAt && Number.isSafeInteger(invocation.recordedAt) && invocation.recordedAt >= invocation.startedAt && invocation.recordedAt <= now, 'invocation budget mismatch');
  const registry = await invocationRegistry(p.worktree, p.invocationId);
  requireValue(JSON.stringify(invocation) === await readFile(registry.file, 'utf8'), 'invocation registry mismatch');
  const cwd = await realpath(p.worktree), entry = await realpath(p.entryRoot);
  const common = await realpath(resolve(cwd, git(cwd, 'rev-parse', '--git-common-dir')));
  requireValue(await realpath(resolve(entry, git(entry, 'rev-parse', '--git-common-dir'))) === common, 'entry and target repository differ');
  requireValue(/^(?:https:\/\/github\.com\/|git@github\.com:)HYY-yu\/SlideLatch(?:\.git)?$/.test(git(cwd, 'remote', 'get-url', 'origin')), 'repository origin mismatch');
  requireValue(cwd !== entry && await realpath(resolve(cwd, git(cwd, 'rev-parse', '--git-dir'))) !== common, 'independent worktree required');
  requireValue(git(entry, 'rev-parse', 'HEAD') === p.entrySha && !git(entry, 'status', '--porcelain'), 'entry identity mismatch');
  requireValue(git(cwd, 'rev-parse', 'HEAD') === p.baseSha && !git(cwd, 'status', '--porcelain') && p.branch && p.branch !== 'main' && git(cwd, 'branch', '--show-current') === p.branch, 'target identity mismatch');
  requireValue(Array.isArray(p.paths) && p.paths.length && new Set(p.paths).size === p.paths.length, 'exact paths required');
  for (const path of p.paths) { requireValue(!/[?*\[\]\\]/.test(path), 'glob forbidden'); await checkedPath(cwd, path); }
  if (p.version === 2 && p.work.kind === 'existing-pr') requireValue(p.baseSha === p.work.target.head && now - p.work.target.observedAt <= 60000, 'fresh existing PR checkout required');
  const work = p.version === 2 ? { ...p.work, allowPublish: p.publish } : undefined;
  return { ...p, ...(work ? { work } : {}), issue: p.issue ?? null, worktree: cwd, entryRoot: entry, deadline: p.startedAt + 1200000, acquire: { ...(work ? { work } : {}), issue: p.issue ?? null, authorization: p.authorization, owner: p.owner, paths: p.paths, timeoutMs: p.startedAt + 1200000 - now } };
}
// No business capability is handed off until this gate returns READY.
export async function admit(p, cap) {
  const s = await inspect(p.worktree);
  if (s.epoch === cap.epoch && s.phase === (p.work?.kind === 'existing-pr' ? 'SEALED' : 'ACTIVE') && s.actors.length === 0 && s.commands.length === 0 && s.deadline <= p.deadline && Date.now() < p.deadline) return { status: 'READY', epoch: s.epoch, deadline: s.deadline };
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
async function invocationRegistry(worktree, invocationId) {
  requireValue(typeof worktree === 'string' && typeof invocationId === 'string' && invocationId.trim(), 'worktree and invocation identity required');
  const cwd = await realpath(worktree);
  const common = await realpath(resolve(cwd, git(cwd, 'rev-parse', '--git-common-dir')));
  const directory = join(common, 'loop-a-invocations');
  return { common, directory, file: join(directory, createHash('sha256').update(invocationId).digest('hex') + '.json') };
}
export async function beginInvocation(file, input = {}, now = Date.now()) {
  const registry = await invocationRegistry(input.worktree, input.invocationId);
  const startedAt = input.startedAt ?? now;
  requireValue(Number.isSafeInteger(startedAt) && startedAt <= now && now < startedAt + 1200000, 'valid original start required');
  const proposed = { version: 1, invocationId: input.invocationId, common: registry.common, startedAt, recordedAt: now, timingSource: input.startedAt === undefined ? 'first-observable-entry' : 'caller-attested-dispatch-time' };
  await mkdir(registry.directory, { recursive: true });
  try {
    const handle = await open(registry.file, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(proposed)); await handle.sync(); } finally { await handle.close(); }
    const directory = await open(registry.directory, 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const record = JSON.parse(await readFile(registry.file, 'utf8'));
  requireValue(record.version === 1 && record.invocationId === input.invocationId && record.common === registry.common && (input.startedAt === undefined || record.startedAt === input.startedAt) && now < record.startedAt + 1200000, 'invocation start cannot be reset');
  await writeFile(file, JSON.stringify(record), { flag: 'wx', mode: 0o600 });
  return record;
}
export async function acquireOnce(input, capabilityFile) {
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
  requireValue((s.version === 3 || now <= p.deadline) && s.deadline <= p.deadline && Number.isInteger(s.repair) && s.repair >= 0 && s.repair <= p.maxRepairs, 'budget exceeded');
  requireValue(s.phase === 'RELEASED' && s.mutation === null && s.issue === p.issue && s.owner === p.owner && s.authorization === p.authorization && s.cwd === p.worktree && s.base === p.baseSha && s.branch === p.branch && JSON.stringify(s.paths) === JSON.stringify(p.paths), 'matching released round required');
  const changed = s.version !== 3 || s.actors.some(a => a.role === 'writer');
  if (s.version === 3) {
    requireValue(p.version === 2 && JSON.stringify(s.work) === JSON.stringify(p.work) && s.commands.every(c => c.exit?.ended <= s.deadline + 2000), 'matching work and bounded commands required');
    requireValue(s.review?.base === s.pr?.base && s.ci?.base === s.pr?.base, 'review and CI base required');
  }
  requireValue(sha(s.head) && (changed ? s.head !== s.base : s.work.kind === 'existing-pr' && s.head === s.base) && s.review?.passed === true && s.review.head === s.head && s.pr?.head === s.head && (s.version === 3 && (s.work.kind === 'existing-pr' || s.shipping.intent) ? typeof s.pr.draft === 'boolean' : s.pr.draft === true) && /^https:\/\/github\.com\/HYY-yu\/SlideLatch\/pull\/[1-9][0-9]*$/.test(s.pr.url) && s.ci?.head === s.head && s.ci.passed === true && sha(s.ci.mergeSha), 'complete new-head evidence required');
  requireValue(Array.isArray(s.actors) && (!changed || s.actors.some(a => a.role === 'writer')) && s.actors.some(a => a.role === 'reviewer' && a.id === s.review.actor && !s.authors.includes(a.id)) && new Set(s.actors.map(a => a.id)).size === s.actors.length, 'independent actors required');
  for (const a of s.actors) {
    requireValue(a.id && a.stopped && s.stopEvidence?.observations.some(o => o.id === a.id && o.status === 'stop-acknowledged' && o.noExternalProcesses === true && o.source && Number.isFinite(o.observedAt) && o.observedAt >= a.lastActivity && o.observedAt <= now), 'actor stop required');
  }
  for (const role of changed ? ['writer', 'reviewer'] : ['reviewer']) {
    const c = s.commands.findLast(c => s.actors.some(a => a.id === c.actor && a.role === role && (role !== 'reviewer' || a.id === s.review.actor)) && c.label === 'verify');
    requireValue(c?.identity?.head === s.head && c.exit?.code === 0, 'latest exact-head verification required');
  }
  if (changed) requireValue(s.commands.some(c => c.label === 'commit'), 'commit required');
  if (s.version >= 2) {
    if (changed) requireValue(s.commands.some(c => c.label === 'commit' && c.result?.head === s.head && c.result.epoch === s.epoch && c.result.operation === c.id && c.result.actor === c.actor), 'supervisor commit result required');
    for (const c of s.commands.filter(c => c.label === 'verify' && c.identity?.head === s.head)) requireValue(c.result?.head === s.head && c.result.epoch === s.epoch && c.result.operation === c.id && c.result.actor === c.actor, 'supervisor verify result required');
  }
  for (const c of s.commands) requireValue(s.stopEvidence.commandIds?.includes(c.id) && c.status === 'EXITED' && c.identity && c.exit && c.identity.pid === c.exit.pid && c.identity.started === c.exit.started && c.exit.groupGone === true && c.exit.ended >= c.identity.started, 'actual command exit required');
  requireValue(remote?.repository === p.repository && (remote.issue ?? null) === (p.issue ?? null) && remote.head === s.head && remote.draft === s.pr.draft && remote.url === s.pr.url && remote.run === s.ci.run && remote.mergeSha === s.ci.mergeSha && remote.passed === true && remote.source && Number.isFinite(remote.observedAt) && remote.observedAt >= s.stopEvidence.at && remote.observedAt <= now, 'fresh remote evidence required');
  if (s.version === 3) {
    requireValue(remote.base === s.pr.base && remote.baseRef === s.pr.baseRef && remote.headRef === s.pr.headRef, 'fresh remote base binding required');
    const result = s.shipping.result;
    if (s.shipping.intent) requireValue(result && result.outcome !== 'unknown', 'pending merge cannot complete');
    if (result?.outcome === 'merged') {
      requireValue(remote.merged === true && remote.actualMergeSha === result.sha, 'fresh actual merge evidence required');
      if (s.shipping.deployment?.status === 'success') {
        productionEvidence(remote.production, result, now);
        requireValue(remote.production.status === 'success' && remote.production.id === s.shipping.deployment.id && remote.production.observedAt >= s.shipping.deployment.observedAt, 'fresh production evidence required');
      }
    }
    return { status: 'RELEASED', outcome: result?.outcome === 'merged' ? s.shipping.deployment?.status === 'success' ? 'DEPLOYED' : s.shipping.deployment?.status === 'failure' ? 'DEPLOYMENT_FAILED' : 'DEPLOYMENT_PENDING' : result ? 'MERGE_BLOCKED' : changed ? s.work.kind === 'existing-pr' ? 'PR_UPDATED' : 'DRAFT_READY' : 'PR_ACCEPTED', validation: 'structural-only', head: s.head, pr: s.pr.url, run: s.ci.run, actualMergeSha: result?.sha ?? null };
  }
  return { status: 'RELEASED', validation: 'structural-only', head: s.head, pr: s.pr.url, run: s.ci.run };
}
function productionEvidence(d, result, now) {
  requireValue(d && d.sha === result.sha && d.environment === 'production' && ['pending', 'failure', 'success'].includes(d.status) && d.provider?.trim() && d.id?.trim() && d.url?.trim() && d.source?.trim() && Number.isSafeInteger(d.observedAt) && d.observedAt >= result.observedAt && d.observedAt <= now && now - d.observedAt <= 60000, 'fresh exact production observation required');
  if (d.status === 'success') requireValue(d.build === 'success' && d.regression?.sha === d.sha && d.regression.environment === 'production' && d.regression.passed === true && d.regression.source?.trim() && d.regression.observedAt >= result.observedAt && d.regression.observedAt <= d.observedAt, 'actual production regression required');
}
export function observeDeployment(p, archive, remote, now = Date.now()) {
  const previous = complete(p, archive, remote, now);
  requireValue(archive.version === 3 && archive.shipping.result?.outcome === 'merged' && ['DEPLOYMENT_PENDING', 'DEPLOYMENT_FAILED', 'DEPLOYED'].includes(previous.outcome), 'released confirmed merge archive required');
  requireValue(remote.observer?.id?.trim() && remote.observer.source?.trim() && remote.observer.observedAt >= archive.shipping.result.observedAt && remote.observer.observedAt <= now && now - remote.observer.observedAt <= 60000, 'current real observer identity required');
  productionEvidence(remote.production, archive.shipping.result, now);
  return { status: 'OBSERVED', outcome: remote.production.status === 'success' ? 'DEPLOYED' : remote.production.status === 'failure' ? 'DEPLOYMENT_FAILED' : 'DEPLOYMENT_PENDING', validation: 'structural-only', originEpoch: archive.epoch, observer: remote.observer, head: archive.head, actualMergeSha: archive.shipping.result.sha, production: remote.production };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv[2] === 'begin') { console.log(JSON.stringify(await beginInvocation(process.argv[4], JSON.parse(await readFile(process.argv[3], 'utf8'))))); }
    else if (process.argv[2] === 'acquire') { console.log(JSON.stringify(await acquireOnce(JSON.parse(await readFile(process.argv[3], 'utf8')), process.argv[4]))); } else {
    const args = await Promise.all(process.argv.slice(3).map(p => readFile(p, 'utf8').then(JSON.parse)));
    requireValue(['prepare', 'complete', 'observe-deployment', 'select'].includes(process.argv[2]), 'use prepare input.json or complete plan.json archive.json remote.json');
    console.log(JSON.stringify(await (process.argv[2] === 'prepare' ? prepare(args[0]) : process.argv[2] === 'select' ? selectWork(args[0]) : process.argv[2] === 'observe-deployment' ? observeDeployment(...args) : complete(...args)), null, 2));
    }
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
