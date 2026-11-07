import { realpath, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { checkedPath } from './loop-a-lifecycle.mjs';
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
  requireValue(cwd !== entry && await realpath(resolve(cwd, git(cwd, 'rev-parse', '--git-dir'))) !== common, 'independent worktree required');
  requireValue(git(entry, 'rev-parse', 'HEAD') === p.entrySha && !git(entry, 'status', '--porcelain'), 'entry identity mismatch');
  requireValue(git(cwd, 'rev-parse', 'HEAD') === p.baseSha && !git(cwd, 'status', '--porcelain') && p.branch && p.branch !== 'main' && git(cwd, 'branch', '--show-current') === p.branch, 'target identity mismatch');
  requireValue(Array.isArray(p.paths) && p.paths.length && new Set(p.paths).size === p.paths.length, 'exact paths required');
  for (const path of p.paths) { requireValue(!/[?*\[\]\\]/.test(path), 'glob forbidden'); await checkedPath(cwd, path); }
  return { ...p, worktree: cwd, entryRoot: entry, deadline: p.startedAt + 1200000, acquire: { issue: p.issue, authorization: p.authorization, owner: p.owner, paths: p.paths, timeoutMs: p.startedAt + 1200000 - now } };
}
// This checks consistency, not authenticity. The host retrieves the original evidence.
export function complete(p, s, remote, now = Date.now()) {
  requireValue(now <= p.deadline && s.deadline <= p.deadline && Number.isInteger(s.repair) && s.repair >= 0 && s.repair <= p.maxRepairs, 'budget exceeded');
  requireValue(s.phase === 'RELEASED' && s.mutation === null && s.issue === p.issue && s.cwd === p.worktree && s.base === p.baseSha && s.branch === p.branch && JSON.stringify(s.paths) === JSON.stringify(p.paths), 'matching released round required');
  requireValue(sha(s.head) && s.head !== s.base && s.review?.passed === true && s.review.head === s.head && s.pr?.head === s.head && s.pr.draft === true && s.ci?.head === s.head && s.ci.passed === true && sha(s.ci.mergeSha), 'complete new-head evidence required');
  requireValue(Array.isArray(s.actors) && s.actors.some(a => a.role === 'writer') && s.actors.some(a => a.role === 'reviewer' && a.id === s.review.actor && !s.authors.includes(a.id)) && new Set(s.actors.map(a => a.id)).size === s.actors.length, 'independent actors required');
  for (const a of s.actors) {
    requireValue(a.id && a.stopped && s.stopEvidence?.observations.some(o => o.id === a.id && o.status === 'stop-acknowledged' && o.noExternalProcesses === true && o.source && o.observedAt >= a.lastActivity), 'actor stop required');
  }
  for (const role of ['writer', 'reviewer']) requireValue(s.commands.some(c => s.actors.some(a => a.id === c.actor && a.role === role) && c.label === 'verify' && c.identity?.head === s.head && c.exit?.code === 0), 'exact-head verification required');
  requireValue(s.commands.some(c => c.label === 'commit'), 'commit required');
  for (const c of s.commands) requireValue(c.status === 'EXITED' && c.identity && c.exit && c.identity.pid === c.exit.pid && c.identity.started === c.exit.started && c.exit.groupGone === true && c.exit.ended >= c.identity.started, 'actual command exit required');
  requireValue(remote?.repository === p.repository && remote.issue === p.issue && remote.head === s.head && remote.draft === true && remote.url === s.pr.url && remote.run === s.ci.run && remote.mergeSha === s.ci.mergeSha && remote.passed === true && remote.source && remote.observedAt >= s.stopEvidence.at, 'fresh remote evidence required');
  return { status: 'RELEASED', head: s.head, pr: s.pr.url, run: s.ci.run };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = await Promise.all(process.argv.slice(3).map(p => readFile(p, 'utf8').then(JSON.parse)));
    requireValue(['prepare', 'complete'].includes(process.argv[2]), 'use prepare input.json or complete plan.json archive.json remote.json');
    console.log(JSON.stringify(await (process.argv[2] === 'prepare' ? prepare(args[0]) : complete(...args)), null, 2));
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
