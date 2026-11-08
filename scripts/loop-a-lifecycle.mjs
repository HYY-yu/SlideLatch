import { mkdir, readFile, writeFile, rename, rmdir, realpath, lstat, open } from 'node:fs/promises';
import { join, resolve, relative, dirname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { userInfo } from 'node:os';
const SUPERVISOR = Symbol('private supervisor authority');
const PROJECT_CHECKS = Object.freeze(['verify', 'cloudflare-root-install']);
const environment = { PATH: `${dirname(process.execPath)}:/opt/homebrew/bin:/usr/bin:/bin`, HOME: userInfo().homedir, LANG: 'C.UTF-8', GIT_TERMINAL_PROMPT: '0' };
const exec = promisify(execFile);
const digest = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const assert = (x, message) => { if (!x) throw Error(message); };
const git = async (cwd, ...args) => (await exec('/usr/bin/git', ['--no-optional-locks', '-C', cwd, ...args], { env: environment })).stdout.trim();
const sha = value => /^[a-f0-9]{40}$/.test(value ?? '');
const issue = value => value === null || Number.isSafeInteger(value) && value > 0;
const fresh = (value, now) => Number.isSafeInteger(value) && value <= now && now - value <= 60000;
const prUrl = number => `https://github.com/HYY-yu/SlideLatch/pull/${number}`;
export function validateWork(work, now = Date.now()) {
  assert(work && ['implementation', 'existing-pr'].includes(work.kind) && ['key', 'goal', 'authorizationSource', 'scopeSource'].every(key => typeof work[key] === 'string' && work[key].trim()), 'user goal, authorization source and coordinator scope required');
  assert(work.mergeAuthorization === null || typeof work.mergeAuthorization === 'string' && work.mergeAuthorization.trim(), 'invalid merge authorization');
  if (work.kind === 'implementation') assert(work.target === null, 'new work must not impersonate an existing PR');
  else {
    const t = work.target;
    assert(t && Number.isSafeInteger(t.number) && t.number > 0 && t.url === prUrl(t.number) && sha(t.head) && sha(t.base) && ['baseRef', 'headRef', 'source'].every(key => typeof t[key] === 'string' && t[key].trim()) && Array.isArray(t.authors) && t.authors.length && t.authors.every(id => typeof id === 'string' && id.trim()) && Number.isSafeInteger(t.observedAt) && t.observedAt <= now, 'exact existing PR and historical author provenance required');
  }
  return work;
}
export function validateMergeSnapshot(snapshot, state, now = Date.now()) {
  const d = snapshot, s = state;
  assert(d && d.number === s.pr.number && d.url === s.pr.url && d.head === s.head && d.base === s.pr.base && d.base === s.ci.base && d.baseRef === 'main' && s.pr.baseRef === 'main' && d.headRef === s.pr.headRef, 'fresh PR identity and base required');
  assert(d.state === 'OPEN' && d.draft === false && d.mergeable === true && d.unresolved === 0 && ['APPROVED', null].includes(d.reviewDecision) && d.source?.trim() && fresh(d.observedAt, now), 'merge readiness unavailable or stale');
  const platform = d.requiredChecks;
  assert(platform && Object.keys(platform).sort().join() === 'names,observedAt,source' && Array.isArray(platform.names) && platform.names.every(name => typeof name === 'string' && name.trim()) && new Set(platform.names).size === platform.names.length && platform.source?.trim() && fresh(platform.observedAt, now), 'fresh platform required checks observation required');
  const required = new Set([...PROJECT_CHECKS, ...platform.names]);
  assert(d.run === s.ci.run && d.ciMergeSha === s.ci.mergeSha && d.checksComplete === true && Array.isArray(d.checks) && [...required].every(name => d.checks.some(c => c.name === name && c.conclusion === 'success' && [s.head, s.ci.mergeSha].includes(c.head) && c.source?.trim())) && d.checks.every(c => ['success', 'neutral', 'skipped'].includes(c.conclusion)), 'current complete checks required');
  assert(s.review?.head === s.head && s.review.base === d.base && d.acceptance?.head === s.head && d.acceptance.base === d.base && d.acceptance.passed === true && d.acceptance.evidence?.trim(), 'current base acceptance required');
  return d;
}
function stopped(s) {
  return s.stopEvidence && s.commands.every(c => c.status === 'EXITED' && c.exit?.groupGone === true && s.stopEvidence.commandIds.includes(c.id) && s.stopEvidence.at >= c.exit.ended) && s.actors.every(a => a.stopped && s.stopEvidence.observations.some(o => o.id === a.id && o.observedAt >= a.lastActivity && s.commands.filter(c => c.actor === a.id).every(c => o.observedAt >= c.exit.ended)));
}
async function location(cwd) {
  cwd = await realpath(cwd);
  const common = await realpath(resolve(cwd, await git(cwd, 'rev-parse', '--git-common-dir')));
  assert(await realpath(resolve(cwd, await git(cwd, 'rev-parse', '--git-dir'))) !== common, 'independent worktree required');
  return { cwd, root: join(common, 'loop-a'), lock: join(common, 'loop-a', 'lock') };
}
async function atomic(path, data) {
  const temp = `${path}.${randomUUID()}`;
  await writeFile(temp, JSON.stringify(data), { mode: 0o600, flag: 'wx' });
  await rename(temp, path);
  const file = await open(path, 'r'); try { await file.sync(); } finally { await file.close(); }
  const directory = await open(dirname(path), 'r'); try { await directory.sync(); } finally { await directory.close(); }
}
function valid(s) {
  assert(s && [1, 2, 3].includes(s.version) && typeof s.epoch === 'string' && Number.isSafeInteger(s.revision) && s.revision >= 0 && Array.isArray(s.authors) && Array.isArray(s.actors) && s.operations && Number.isFinite(s.deadline) && ['ACTIVE','SEALED','REVIEWED','PR','CI','STOPPING','QUIESCENT','RELEASED','BLOCKED_UNCERTAIN','CANCELLED_RELEASED','MERGING','MERGED','DEPLOYED'].includes(s.phase), 'invalid lifecycle state');
  const keys = 'version epoch revision phase issue authorization owner cwd branch base head paths deadline coordinator actors authors operations repair review pr ci commands stopEvidence progress stagnant mutation definitions'.split(' ').sort();
  if (s.version >= 2) keys.push('cancellation');
  if (s.version === 3) keys.push('work', 'shipping');
  keys.sort();
  assert(Object.keys(s).sort().join() === keys.join(), 'unknown state fields');
  assert((s.version === 3 ? issue(s.issue) : Number.isSafeInteger(s.issue) && s.issue > 0) && [s.authorization,s.owner,s.cwd,s.branch].every(x => typeof x === 'string' && x.length) && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(s.base) && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(s.head) && /^[a-f0-9]{64}$/.test(s.coordinator), 'invalid state metadata');
  assert(Array.isArray(s.paths) && s.paths.length && s.paths.every(x => typeof x === 'string') && Array.isArray(s.commands) && s.authors.every(x => typeof x === 'string') && Number.isSafeInteger(s.repair) && s.repair >= 0 && s.repair <= 2 && Number.isSafeInteger(s.stagnant) && s.stagnant >= 0 && s.stagnant <= 2, 'invalid state collections');
  for (const a of s.actors) assert(Object.keys(a).sort().join() === 'capability,id,intent,lastActivity,role,stopped,worktree' && ['writer','reviewer'].includes(a.role) && typeof a.intent === 'string' && (a.id === null || typeof a.id === 'string') && (a.capability === null || /^[a-f0-9]{64}$/.test(a.capability)) && typeof a.stopped === 'boolean' && Number.isFinite(a.lastActivity) && (a.worktree === null || typeof a.worktree === 'string'), 'invalid actor schema');
  assert(s.actors.filter(a => a.role === 'writer' && !a.stopped).length <= 1, 'multiple writers');
  assert(s.operations && Object.getPrototypeOf(s.operations) === Object.prototype && !Array.isArray(s.operations), 'invalid operations');
  for (const op of Object.values(s.operations)) assert(op && Object.keys(op).sort().join() === 'payload,result' && /^[a-f0-9]{64}$/.test(op.payload) && op.result?.epoch === s.epoch && Number.isSafeInteger(op.result.revision), 'invalid operation record');
  for (const c of s.commands) assert(c && Object.keys(c).sort().join() === (s.version >= 2 ? 'actor,exit,id,identity,label,nonce,result,status' : 'actor,exit,id,identity,label,nonce,status') && typeof c.id === 'string' && typeof c.actor === 'string' && typeof c.nonce === 'string' && ['verify','commit'].includes(c.label) && ['PENDING','EXITED','UNCERTAIN'].includes(c.status), 'invalid command record');
  assert(s.definitions && Object.keys(s.definitions).sort().join() === 'environment,git,node,npm' && s.definitions.node === process.execPath && s.definitions.git === '/usr/bin/git' && typeof s.definitions.npm === 'string' && JSON.stringify(s.definitions.environment) === JSON.stringify(environment), 'invalid command definitions');
  assert(s.stopEvidence === null || s.stopEvidence && Object.keys(s.stopEvidence).sort().join() === 'at,commandIds,observations' && Array.isArray(s.stopEvidence.observations) && Array.isArray(s.stopEvidence.commandIds) && Number.isFinite(s.stopEvidence.at), 'invalid stop evidence');
  for (const c of s.commands) {
    if (s.version >= 2) assert(c.result === null || c.result && c.status === 'EXITED' && c.exit?.code === 0 && c.result.epoch === s.epoch && c.result.actor === c.actor && c.result.operation === c.id && Number.isFinite(c.result.at) && c.result.at >= c.exit.ended && /^[a-f0-9]{40}$/.test(c.result.head) && /^[a-f0-9]{40}$/.test(c.result.tree) && Array.isArray(c.result.parents) && Array.isArray(c.result.paths), 'invalid supervisor result');
    assert(c.identity === null || c.identity && Object.keys(c.identity).sort().join() === 'head,pid,started,supervisor' && Number.isInteger(c.identity.pid) && Number.isFinite(c.identity.started) && Number.isInteger(c.identity.supervisor), 'invalid process identity');
    assert(c.status !== 'EXITED' || c.identity && c.exit && c.exit.pid === c.identity.pid && c.exit.started === c.identity.started && c.exit.groupGone === true && Number.isFinite(c.exit.ended) && c.exit.ended >= c.exit.started, 'invalid exit evidence');
  }
  assert(s.mutation === null || s.mutation && Object.keys(s.mutation).sort().join() === 'contentHash,operation,path,status' && s.mutation.status === 'PENDING' && typeof s.mutation.operation === 'string' && s.paths.includes(s.mutation.path) && /^[a-f0-9]{64}$/.test(s.mutation.contentHash), 'invalid mutation state');
  assert(s.review === null || s.review && Object.keys(s.review).sort().join() === (s.version === 3 ? 'actor,base,evidence,head,passed' : 'actor,evidence,head,passed') && s.review.head === s.head && s.review.passed === true && typeof s.review.evidence === 'string' && s.actors.some(a => a.id === s.review.actor && a.role === 'reviewer') && !s.authors.includes(s.review.actor), 'invalid review evidence');
  assert(s.pr === null || s.pr && Object.keys(s.pr).sort().join() === (s.version === 3 ? 'base,baseRef,draft,head,headRef,number,observedAt,source,url' : 'draft,head,url') && s.pr.head === s.head && (s.version === 3 ? typeof s.pr.draft === 'boolean' : s.pr.draft === true) && typeof s.pr.url === 'string', 'invalid PR evidence');
  assert(s.ci === null || s.ci && Object.keys(s.ci).sort().join() === (s.version === 3 ? 'base,head,mergeSha,observedAt,passed,run,source' : 'head,mergeSha,passed,run') && s.ci.head === s.head && s.ci.passed === true && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(s.ci.mergeSha) && typeof s.ci.run === 'string', 'invalid CI evidence');
  assert(!['REVIEWED','PR','CI'].includes(s.phase) || s.review, 'missing review state');
  assert(!['PR','CI'].includes(s.phase) || s.pr, 'missing PR state');
  assert(s.phase !== 'CI' || s.ci, 'missing CI state');
  if (s.version >= 2) {
    assert((s.phase === 'CANCELLED_RELEASED') === (s.cancellation !== null), 'invalid cancellation state');
    if (s.cancellation) assert(['legacy-audited', 'supervisor-evidence'].includes(s.cancellation.mode) && s.cancellation.binding?.epoch === s.epoch && s.cancellation.binding.head === s.head && s.cancellation.binding.base === s.base && s.cancellation.binding.cwd === s.cwd && Number.isFinite(s.cancellation.at) && typeof s.cancellation.reason === 'string' && s.cancellation.reason.length && /^[a-f0-9]{64}$/.test(s.cancellation.implementationHash), 'invalid cancellation audit');
  }
  if (s.version === 3) {
    validateWork(s.work);
    assert(s.shipping && Object.keys(s.shipping).sort().join() === 'deployment,intent,result', 'invalid shipping state');
    if (s.shipping.intent) assert(s.shipping.intent.expected_head_sha === s.head && s.shipping.intent.method === 'merge' && Number.isFinite(s.shipping.intent.at) && s.shipping.intent.at <= s.deadline, 'invalid merge intent');
    if (s.shipping.result) assert(s.shipping.intent && ['merged','denied','not-merged'].includes(s.shipping.result.outcome) && s.shipping.result.head === s.head && s.shipping.result.source?.trim(), 'invalid merge result');
    assert(s.phase !== 'MERGING' || s.shipping.intent && s.shipping.result === null, 'missing pending merge');
    assert(!['MERGED','DEPLOYED'].includes(s.phase) || s.shipping.result?.outcome === 'merged' && sha(s.shipping.result.sha), 'missing actual merge result');
    assert(s.phase !== 'DEPLOYED' || s.shipping.deployment?.status === 'success', 'missing production result');
  }
  return s;
}
export async function acquire(cwd, input) {
  const p = await location(cwd);
  assert((input.work ? issue(input.issue ?? null) : Number.isSafeInteger(input.issue) && input.issue > 0) && input.authorization?.trim() && input.owner?.trim() && Array.isArray(input.paths) && input.paths.length, 'issue, authorization, owner and paths required');
  if (input.work) validateWork(input.work);
  for (const path of input.paths) await checkedPath(p.cwd, path);
  const timeout = input.timeoutMs ?? 1200000;
  assert(Number.isSafeInteger(timeout) && timeout > 0 && timeout <= 1200000, 'invalid deadline');
  if (input.work?.kind === 'existing-pr') assert(await git(cwd, 'rev-parse', 'HEAD') === input.work.target.head && !(await git(cwd, 'status', '--porcelain')) && fresh(input.work.target.observedAt, Date.now()), 'existing PR checkout or observation changed');
  await mkdir(p.root, { recursive: true });
  await mkdir(p.lock); // Existing/creating/crashed locks are never reclaimed.
  const token = randomUUID();
  const s = { version: input.work ? 3 : 2, ...(input.work ? { work: input.work, shipping: { intent: null, result: null, deployment: null } } : {}), cancellation: null, epoch: randomUUID(), revision: 0, phase: input.work?.kind === 'existing-pr' ? 'SEALED' : 'ACTIVE', issue: input.issue ?? null, authorization: input.authorization, owner: input.owner, cwd: p.cwd, branch: await git(cwd, 'branch', '--show-current'), base: await git(cwd, 'rev-parse', 'HEAD'), head: await git(cwd, 'rev-parse', 'HEAD'), paths: input.paths, mutation: null, definitions: { node: process.execPath, git: '/usr/bin/git', npm: await realpath(join(dirname(process.execPath), 'npm')), environment }, commands: [], stopEvidence: null, progress: null, stagnant: 0, deadline: Date.now() + timeout, coordinator: digest(token), actors: [], authors: input.work?.target?.authors ?? [], operations: {}, repair: 0, review: null, pr: null, ci: null };
  valid(s);
  await atomic(join(p.lock, 'state.json'), s);
  return { epoch: s.epoch, revision: 0, token };
}
export async function checkedPath(cwd, path) {
  assert(typeof path === 'string' && path.length && !path.split(/[\\/]/).some(x => ['..','.git','.',''].includes(x)) && !path.startsWith('/'), 'unsafe path');
  const dest = resolve(cwd, path);
  assert(!relative(cwd, dest).startsWith('..'), 'path escape');
  let current = cwd;
  for (const part of path.split('/')) {
    current = join(current, part);
    try { const st = await lstat(current); assert(!st.isSymbolicLink(), 'symlink forbidden'); assert(st.isDirectory() || st.nlink === 1, 'hardlink forbidden'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return dest;
}
export async function inspect(cwd) {
  const p = await location(cwd);
  const s = valid(JSON.parse(await readFile(join(p.lock, 'state.json'), 'utf8')));
  const { coordinator, operations, ...safe } = s;
  return { ...safe, commands: safe.commands.map(({ nonce, ...command }) => command), actors: safe.actors.map(({ capability, ...actor }) => actor) };
}
export async function transition(cwd, request, internal = null) {
  if (request.action.startsWith('command-')) assert(internal?.key === SUPERVISOR, 'supervisor-only operation');
  const p = await location(cwd);
  if (['release', 'cancel-release'].includes(request.action) && /^[a-f0-9-]{36}$/.test(request.epoch)) {
    const archive = join(p.root, `${request.action === 'cancel-release' ? 'cancelled' : 'released'}-${request.epoch}`);
    try { await lstat(archive); p.lock = archive; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  let tx = join(p.lock, 'transaction');
  await mkdir(tx); // A crashed transaction intentionally blocks recovery.
  try {
    const s = valid(JSON.parse(await readFile(join(p.lock, 'state.json'), 'utf8')));
    assert(request.epoch === s.epoch, 'wrong worktree or stale epoch');
    assert(s.mutation === null, 'pending mutation uncertain; lock retained');
    const coordinator = digest(request.token) === s.coordinator;
    const actor = s.actors.find(a => a.capability === digest(request.token));
    assert(coordinator || actor, 'invalid capability');
    assert(coordinator ? s.cwd === p.cwd : actor.worktree === p.cwd, 'wrong actor worktree');
    assert(typeof request.operation_id === 'string' && request.operation_id.length > 0, 'operation_id required');
    const payload = digest({ action: request.action, data: request.data, actor: coordinator ? 'coordinator' : actor.id });
    assert(!['__proto__','constructor','prototype'].includes(request.operation_id), 'invalid operation ID');
    const prior = Object.hasOwn(s.operations, request.operation_id) ? s.operations[request.operation_id] : null;
    const archiveCancellation = async () => {
      const archive = join(p.root, `cancelled-${s.epoch}`);
      if (p.lock !== archive) {
        try { await lstat(archive); throw Error('cancellation archive collision; lock retained'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        await rename(p.lock, archive); tx = join(archive, 'transaction');
        const directory = await open(p.root, 'r'); try { await directory.sync(); } finally { await directory.close(); }
      }
    };
    if (prior) { assert(prior.payload === payload, 'operation payload conflict'); if (s.phase === 'CANCELLED_RELEASED') await archiveCancellation(); return prior.result; }
    assert(s.phase !== 'CANCELLED_RELEASED', 'cancelled terminal state');
    assert(request.expected_revision === s.revision, 'revision conflict');
    const d = request.data ?? {};
    if (s.version === 3 && s.shipping.intent && !['record-merge', 'record-deployment', 'release'].includes(request.action)) throw Error('shipping outcome must be reconciled; lock retained');
    if (Date.now() >= s.deadline && !['request-stop','confirm-quiescent','revoke-actor','cancel-release','release','command-exit','record-merge','record-deployment'].includes(request.action)) {
      s.phase = 'STOPPING'; s.revision++; await atomic(join(p.lock, 'state.json'), s); throw Error('deadline reached; lock retained');
    }
    if (['record-review','record-pr','record-ci','merge-intent','record-merge','record-deployment','release'].includes(request.action) && await git(s.cwd, 'rev-parse', 'HEAD') !== s.head) {
      s.review = s.ci = null; s.phase = 'BLOCKED_UNCERTAIN'; s.revision++;
      await atomic(join(p.lock, 'state.json'), s); throw Error('head changed; evidence invalidated');
    }
    const needCoordinator = () => assert(coordinator, 'coordinator required');
    switch (request.action) {
      case 'dispatch-intent':
        needCoordinator(); assert((d.role === 'writer' && s.phase === 'ACTIVE' && (s.version !== 3 || s.work.allowPublish === true) || d.role === 'reviewer' && s.phase === 'SEALED') && !s.actors.some(a => !a.stopped), 'invalid dispatch or active actor');
        s.actors.push({ intent: randomUUID(), role: d.role, id: null, capability: null, stopped: false, worktree: null, lastActivity: Date.now() }); break;
      case 'bind-actor': {
        needCoordinator(); const a = s.actors.find(a => a.intent === d.intent);
        assert(a && !a.id && !a.stopped && typeof d.id === 'string' && d.id.length && typeof d.capability === 'string' && d.capability.length >= 32, 'invalid binding');
        assert(!s.actors.some(a => a.id === d.id) && (a.role !== 'reviewer' || !s.authors.includes(d.id)), 'identity conflict');
        const workerLocation = await location(d.worktree ?? s.cwd);
        assert(workerLocation.root === p.root && (a.role === 'writer' ? workerLocation.cwd === s.cwd : workerLocation.cwd !== s.cwd && await git(workerLocation.cwd, 'rev-parse', 'HEAD') === s.head && !(await git(workerLocation.cwd, 'status', '--porcelain'))), 'invalid actor worktree');
        a.worktree = workerLocation.cwd; a.lastActivity = Date.now();
        a.id = d.id; a.capability = digest(d.capability); if (a.role === 'writer') s.authors.push(d.id); break;
      }
      case 'write': {
        assert(actor?.role === 'writer' && !actor.stopped && s.phase === 'ACTIVE' && s.paths.includes(d.path) && typeof d.content === 'string', 'write forbidden');
        const target = await checkedPath(p.cwd, d.path);
        actor.lastActivity = Date.now();
        s.mutation = { operation: request.operation_id, path: d.path, contentHash: digest(d.content), status: 'PENDING' };
        s.revision++; await atomic(join(p.lock, 'state.json'), s);
        const temp = `${target}.lease-${randomUUID()}`;
        await writeFile(temp, d.content, { flag: 'wx', mode: 0o600 });
        await checkedPath(p.cwd, d.path); await rename(temp, target);
        s.mutation = null; s.review = s.ci = null; break;
      }
      case 'command-intent':
        assert(actor && !actor.stopped && (actor.role === 'writer' && s.phase === 'ACTIVE' && ['verify','commit'].includes(d.label) || actor.role === 'reviewer' && s.phase === 'SEALED' && d.label === 'verify') && typeof d.nonce === 'string' && !s.commands.some(c => c.status !== 'EXITED'), 'command forbidden');
        s.commands.push({ id: request.operation_id, actor: actor.id, label: d.label, nonce: d.nonce, status: 'PENDING', identity: null, exit: null, ...(s.version >= 2 ? { result: null } : {}) }); break;
      case 'command-start': {
        const c = s.commands.find(c => c.id === d.id);
        assert(c?.status === 'PENDING' && !c.identity && !actor.stopped && ['ACTIVE','SEALED'].includes(s.phase), 'spawn stopped or uncertain');
        if (actor.role === 'reviewer') assert(await git(p.cwd, 'rev-parse', 'HEAD') === s.head && !(await git(p.cwd, 'status', '--porcelain')), 'review checkout changed');
        const commandHead = await git(p.cwd, 'rev-parse', 'HEAD');
        actor.lastActivity = Date.now(); c.identity = { ...internal.launch(s), head: commandHead }; break;
      }
      case 'command-exit': {
        const c = s.commands.find(c => c.id === d.id);
        assert(actor && c?.actor === actor.id && c.status === 'PENDING' && c.nonce === d.nonce && c.identity?.pid === d.evidence?.pid && c.identity?.started === d.evidence?.started && d.evidence && typeof d.evidence.started === 'number' && typeof d.evidence.pid === 'number', 'command ownership evidence required');
        c.status = d.evidence.groupGone === true && (Number.isInteger(d.evidence.code) || typeof d.evidence.signal === 'string') ? 'EXITED' : 'UNCERTAIN'; c.exit = d.evidence;
        if (s.version >= 2 && c.status === 'EXITED' && c.exit.code === 0) {
          const head = await git(p.cwd, 'rev-parse', 'HEAD');
          const tree = await git(p.cwd, 'rev-parse', 'HEAD^{tree}');
          const parents = (await git(p.cwd, 'show', '-s', '--format=%P', head)).split(' ').filter(Boolean);
          const paths = c.label === 'commit' ? (await git(p.cwd, 'diff-tree', '--no-commit-id', '--name-only', '-r', head)).split('\n').filter(Boolean) : [];
          c.result = { epoch: s.epoch, actor: c.actor, operation: c.id, at: Date.now(), head, tree, parents, paths };
          if (c.label === 'commit') assert(parents.length === 1 && parents[0] === c.identity.head && paths.every(path => s.paths.includes(path)), 'commit result outside approved history or scope');
          else assert(head === c.identity.head, 'verify head changed');
        }
        if (c.status === 'UNCERTAIN') s.phase = 'BLOCKED_UNCERTAIN'; break;
      }
      case 'repair':
        needCoordinator(); assert((s.version !== 3 || s.work.allowPublish === true) && ['SEALED','REVIEWED','PR','CI'].includes(s.phase) && stopped(s) && s.repair < 2 && s.stagnant < 2 && d.evidence?.trim(), 'repair budget or actor gate');
        s.stagnant = s.progress === d.evidence ? s.stagnant + 1 : 1; s.progress = d.evidence; s.repair++;
        s.review = s.pr = s.ci = null; s.phase = s.stagnant >= 2 ? 'BLOCKED_UNCERTAIN' : 'ACTIVE'; break;
      case 'request-stop': needCoordinator(); s.phase = 'STOPPING'; break;
      case 'confirm-quiescent':
        needCoordinator(); assert(Array.isArray(d.observations) && d.observations.length === s.actors.length && s.commands.every(c => c.status === 'EXITED' && c.exit?.groupGone === true) && s.actors.every(a => a.id && d.observations.some(o => o.id === a.id && o.status === 'stop-acknowledged' && o.noExternalProcesses === true && typeof o.source === 'string' && o.source.length > 0 && Number.isFinite(o.observedAt) && o.observedAt >= a.lastActivity && o.observedAt <= Date.now())), 'positive actor stop evidence required');
        s.actors.forEach(a => { a.stopped = true; }); s.stopEvidence = { observations: d.observations, commandIds: s.commands.map(c => c.id), at: Date.now() }; if (!['SEALED','REVIEWED','PR','CI','MERGING','MERGED','DEPLOYED'].includes(s.phase)) s.phase = 'QUIESCENT'; break;
      case 'cancel-release': {
        needCoordinator();
        assert(s.phase === 'QUIESCENT' && s.stopEvidence && s.actors.every(a => a.id && a.stopped && a.capability === null), 'all actors must be stopped and revoked');
        const proof = s.stopEvidence;
        assert(proof.observations.length === s.actors.length && new Set(proof.observations.map(o => o.id)).size === s.actors.length && proof.commandIds.length === s.commands.length && new Set(proof.commandIds).size === s.commands.length && s.actors.every(a => proof.observations.some(o => o.id === a.id && o.status === 'stop-acknowledged' && o.noExternalProcesses === true && o.observedAt >= a.lastActivity && o.observedAt <= proof.at && proof.at <= Date.now())) && s.commands.every(c => c.status === 'EXITED' && c.exit?.groupGone === true && proof.commandIds.includes(c.id) && proof.at >= c.exit.ended && proof.observations.some(o => o.id === c.actor && o.observedAt >= c.exit.ended)), 'latest complete stop evidence required');
        const binding = d.binding;
        assert(binding && binding.epoch === s.epoch && binding.revision === s.revision && binding.cwd === p.cwd && binding.common === dirname(p.root) && binding.branch === s.branch && binding.base === s.base && binding.head === s.head && JSON.stringify(binding.paths) === JSON.stringify(s.paths), 'cancellation binding mismatch');
        const observedHead = await git(p.cwd, 'rev-parse', 'HEAD');
        const tree = await git(p.cwd, 'rev-parse', 'HEAD^{tree}');
        const parents = (await git(p.cwd, 'show', '-s', '--format=%P', observedHead)).split(' ').filter(Boolean);
        assert(binding.observedHead === observedHead && binding.tree === tree && JSON.stringify(binding.parents) === JSON.stringify(parents) && await git(p.cwd, 'branch', '--show-current') === s.branch && !(await git(p.cwd, 'status', '--porcelain')), 'cancellation repository drift');
        if (s.version >= 2) {
          let expectedHead = s.base;
          let expectedTree = await git(p.cwd, 'rev-parse', `${s.base}^{tree}`);
          for (const command of s.commands) {
            assert(command.identity.head === expectedHead, 'supervisor history drift');
            if (command.exit.code !== 0) continue;
            const result = command.result;
            assert(result && result.epoch === s.epoch && result.actor === command.actor && result.operation === command.id, 'missing supervisor command result');
            if (command.label === 'commit') {
              assert(result.parents.length === 1 && result.parents[0] === expectedHead, 'supervisor commit chain drift');
              expectedHead = result.head;
              expectedTree = result.tree;
            } else assert(result.head === expectedHead && result.tree === expectedTree, 'supervisor verify drift');
          }
          assert(observedHead === expectedHead && tree === expectedTree, 'observed head differs from final supervisor result');
        }
        const commits = (await git(p.cwd, 'rev-list', `${s.base}..${observedHead}`)).split('\n').filter(Boolean);
        assert(await git(p.cwd, 'merge-base', s.base, observedHead) === s.base, 'cancellation base drift');
        for (const head of commits) {
          const lineage = (await git(p.cwd, 'show', '-s', '--format=%P', head)).split(' ').filter(Boolean);
          const paths = (await git(p.cwd, 'diff-tree', '--no-commit-id', '--name-only', '-r', head)).split('\n').filter(Boolean);
          assert(lineage.length === 1 && paths.every(path => s.paths.includes(path)), 'cancellation history outside scope');
          const commitTree = await git(p.cwd, 'rev-parse', `${head}^{tree}`);
          if (s.version >= 2) assert(s.commands.some(c => c.label === 'commit' && c.result?.head === head && c.result.epoch === s.epoch && c.result.operation === c.id && c.result.actor === c.actor && c.result.parents[0] === lineage[0] && c.result.tree === commitTree), 'missing supervisor commit result');
        }
        assert(typeof d.reason === 'string' && d.reason.trim() && typeof d.codeVersion === 'string' && /^[a-f0-9]{40}$/.test(d.codeVersion), 'cancellation reason and code version required');
        const legacy = s.version === 1;
        if (legacy) assert(d.mode === 'legacy-audited' && d.audit && typeof d.audit.reviewer === 'string' && !s.authors.includes(d.audit.reviewer) && d.audit.reviewer.length && d.audit.authorization?.trim() && d.audit.source?.trim() && d.audit.observedAt >= proof.at && d.audit.observedAt <= Date.now() && JSON.stringify(d.audit.binding) === JSON.stringify(binding), 'explicit independent legacy audit required');
        else assert(d.mode === 'supervisor-evidence', 'explicit supervisor evidence mode required');
        assert(await git(p.cwd, 'rev-parse', 'HEAD') === observedHead && !(await git(p.cwd, 'status', '--porcelain')), 'cancellation head changed');
        if (legacy) { s.version = 2; s.commands.forEach(c => { c.result = null; }); }
        s.cancellation = { mode: d.mode, validation: legacy ? 'independent-reviewer-audit' : 'supervisor-records-with-host-stop-attestation', binding, reason: d.reason, codeVersion: d.codeVersion, implementationHash: digest(await readFile(fileURLToPath(import.meta.url), 'utf8')), audit: legacy ? d.audit : null, at: Date.now() };
        s.phase = 'CANCELLED_RELEASED';
        break;
      }
      case 'revoke-actor': {
        needCoordinator();
        const target = s.actors.find(a => a.id === d.actor);
        const proof = s.stopEvidence;
        assert(s.phase === 'QUIESCENT' && target?.stopped && proof && typeof d.reason === 'string' && d.reason.trim(), 'quiescent actor and revocation reason required');
        assert(proof.observations.length === s.actors.length && new Set(proof.observations.map(o => o.id)).size === s.actors.length && proof.commandIds.length === s.commands.length && new Set(proof.commandIds).size === s.commands.length && s.actors.every(a => a.id && a.stopped && proof.observations.some(o => o.id === a.id && o.status === 'stop-acknowledged' && o.noExternalProcesses === true && o.observedAt >= a.lastActivity && o.observedAt <= proof.at && proof.at <= Date.now())) && s.commands.every(c => c.status === 'EXITED' && c.exit?.groupGone === true && proof.commandIds.includes(c.id) && proof.at >= c.exit.ended && proof.observations.some(o => o.id === c.actor && o.observedAt >= c.exit.ended)), 'latest complete stop evidence required');
        target.capability = null;
        break;
      }
      case 'seal-writer':
        needCoordinator(); assert(s.phase === 'QUIESCENT' && !(await git(cwd, 'status', '--porcelain')), 'clean quiescent worktree required');
        if (s.version === 3) assert(stopped(s) && s.commands.some(c => c.label === 'commit' && c.result !== null && c.exit?.code === 0), 'managed writer commit required');
        s.head = await git(cwd, 'rev-parse', 'HEAD');
        if (s.version === 3) assert(s.commands.some(c => c.label === 'commit' && c.result?.head === s.head), 'current managed commit required');
        s.phase = 'SEALED'; break;
      case 'record-review':
        assert(actor?.role === 'reviewer' && !actor.stopped && !s.authors.includes(actor.id) && s.phase === 'SEALED' && d.head === s.head && d.evidence?.trim() && d.passed === true, 'independent review required');
        if (s.version === 3) assert(sha(d.base) && (!s.work.target || d.base === s.work.target.base), 'review base binding required');
        assert(await git(p.cwd, 'rev-parse', 'HEAD') === s.head && !(await git(p.cwd, 'status', '--porcelain')) && s.commands.every(c => c.status === 'EXITED') && ((c) => c?.status === 'EXITED' && c.exit.code === 0 && c.identity.head === s.head)(s.commands.findLast(c => c.actor === actor.id && c.label === 'verify')), 'clean current reviewer verify required'); s.review = { ...d, actor: actor.id }; s.phase = 'REVIEWED'; break;
      case 'record-pr':
        needCoordinator(); assert(s.phase === 'REVIEWED' && (s.version === 3 && s.work.kind === 'existing-pr' ? typeof d.draft === 'boolean' : d.draft === true) && d.head === s.head && d.url?.startsWith('https://github.com/'), 'reviewed PR required');
        if (s.version === 3) assert(d.url === prUrl(d.number) && d.base === s.review.base && d.baseRef?.trim() && d.headRef?.trim() && d.source?.trim() && fresh(d.observedAt, Date.now()) && (!s.work.target || d.url === s.work.target.url && d.base === s.work.target.base && d.headRef === s.work.target.headRef), 'exact fresh PR binding required');
        s.pr = d; s.phase = 'PR'; break;
      case 'record-ci':
        needCoordinator(); assert(s.phase === 'PR' && d.head === s.head && d.mergeSha && d.run && d.passed === true, 'current CI required');
        if (s.version === 3) assert(d.base === s.pr.base && d.source?.trim() && fresh(d.observedAt, Date.now()), 'fresh CI base required');
        s.ci = d; s.phase = 'CI'; break;
      case 'merge-intent':
        needCoordinator(); assert(s.version === 3 && s.phase === 'CI' && s.work.mergeAuthorization && stopped(s) && !s.shipping.intent, 'authorized stopped merge gate required');
        validateMergeSnapshot(d, s);
        s.shipping.intent = { expected_head_sha: s.head, method: 'merge', at: Date.now(), snapshot: d };
        s.pr.draft = false; s.phase = 'MERGING'; break;
      case 'record-merge':
        needCoordinator(); assert(s.version === 3 && s.phase === 'MERGING' && ['merged','denied','not-merged'].includes(d.outcome) && d.head === s.head && d.base === s.pr.base && d.url === s.pr.url && d.source?.trim() && fresh(d.observedAt, Date.now()) && d.observedAt >= s.shipping.intent.at, 'official merge outcome required');
        assert(d.outcome === 'merged' ? sha(d.sha) && d.parents?.length === 2 && d.parents[0] === s.pr.base && d.parents[1] === s.head : d.sha === null, 'ordinary merge parents or explicit non-merge required');
        s.shipping.result = d; s.phase = d.outcome === 'merged' ? 'MERGED' : 'CI'; break;
      case 'record-deployment':
        needCoordinator(); assert(s.version === 3 && s.phase === 'MERGED' && d.sha === s.shipping.result.sha && d.environment === 'production' && ['pending','failure','success'].includes(d.status) && d.provider?.trim() && d.id?.trim() && d.url?.trim() && d.source?.trim() && fresh(d.observedAt, Date.now()) && d.observedAt >= s.shipping.result.observedAt, 'actual merged SHA production observation required');
        if (d.status === 'success') assert(d.build === 'success' && d.regression?.passed === true && d.regression.sha === d.sha && d.regression.environment === 'production' && d.regression.source?.trim() && d.regression.observedAt >= s.shipping.result.observedAt && d.regression.observedAt <= d.observedAt, 'production build and live regression required');
        s.shipping.deployment = d;
        if (d.status === 'success') s.phase = 'DEPLOYED'; break;
      case 'release':
        needCoordinator();
        assert((s.version === 3 ? ['CI','MERGED','DEPLOYED'].includes(s.phase) : ['CI','QUIESCENT'].includes(s.phase)) && stopped(s) && await git(cwd, 'rev-parse', 'HEAD') === s.head, 'release evidence missing');
        if (s.version === 3) assert(s.review && s.pr && s.ci && (!s.shipping.intent || s.shipping.result), 'pending outcome retains lock');
        s.phase = 'RELEASED'; break;
      default: throw Error('unsupported action');
    }
    s.revision++;
    const result = { epoch: s.epoch, revision: s.revision, phase: s.phase };
    if (request.action === 'revoke-actor') result.revocation = { actor: d.actor, reason: d.reason, at: Date.now(), operation: request.operation_id };
    s.operations[request.operation_id] = { payload, result };
    valid(s);
    await atomic(join(p.lock, 'state.json'), s);
    if (s.phase === 'CANCELLED_RELEASED') await archiveCancellation();
    if (s.phase === 'RELEASED') { const archive = join(p.root, `released-${s.epoch}`); await rename(p.lock, archive); tx = join(archive, 'transaction'); }
    return result;
  } finally { await rmdir(tx).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
}

// Foreground supervisor: only this live ChildProcess handle authorizes signals.
// Leader exit can precede the last group member's exit/reaping. Observe only:
// the dead ChildProcess no longer authorizes TERM/KILL against a numeric PGID.
async function observeGroupExit(pid) {
  if (!pid) return false;
  const until = performance.now() + 1000;
  do {
    try { process.kill(-pid, 0); }
    catch (error) { return error.code === 'ESRCH'; }
    const remaining = until - performance.now();
    if (remaining <= 0) break;
    await new Promise(resolve => setTimeout(resolve, Math.min(25, remaining)));
  } while (performance.now() < until);
  return false; // Still present, including unreaped zombies: keep the lease.
}

// A crashed supervisor leaves PENDING evidence and the lease held indefinitely.
export async function managedCommand(cwd, request) {
  const label = request.data?.label;
  assert(['verify', 'commit'].includes(label), 'unknown managed command');
  const paths = await location(cwd);
  const before = valid(JSON.parse(await readFile(join(paths.lock, 'state.json'), 'utf8')));
  const prior = before.commands.find(c => c.id === request.operation_id);
  const nonce = prior?.nonce ?? randomUUID();
  const started = await transition(cwd, { ...request, action: 'command-intent', data: { label, nonce } }, { key: SUPERVISOR });
  if (prior) {
    assert(prior.status === 'EXITED', 'existing command outcome uncertain; never respawn');
    return transition(cwd, { ...request, operation_id: `${request.operation_id}:exit`, action: 'command-exit', data: { id: request.operation_id, nonce, evidence: prior.exit } }, { key: SUPERVISOR });
  }
  let startedAt;
  let command = before.definitions.npm, args = ['run', 'verify'];
  if (label === 'commit') {
    const dirty = (await git(cwd, 'diff', '--name-only', 'HEAD')).split('\n').filter(Boolean);
    const untracked = (await git(cwd, 'ls-files', '--others', '--exclude-standard')).split('\n').filter(Boolean);
    assert([...dirty, ...untracked].every(path => before.paths.includes(path)), 'unapproved changes; command remains uncertain');
    for (const path of before.paths) await checkedPath(cwd, path);
    command = before.definitions.node; args = [fileURLToPath(new URL('./loop-a-command-runner.mjs', import.meta.url)), JSON.stringify({ paths: before.paths, issue: before.issue, git: before.definitions.git })];
  }
  assert(before.definitions.npm === await realpath(join(dirname(process.execPath), 'npm')), 'npm definition changed');
  let child, completion;
  let live = true, stopping = false, stoppedAt = null;
  const prelaunch = await inspect(cwd);
  try { await transition(cwd, { ...request, expected_revision: prelaunch.revision, operation_id: `${request.operation_id}:start`, action: 'command-start', data: { id: request.operation_id } }, { key: SUPERVISOR, launch: () => {
    startedAt = Date.now(); child = spawn(command, args, { cwd, detached: true, stdio: 'inherit', env: before.definitions.environment });
    completion = new Promise(resolve => {
      child.once('error', error => { live = false; resolve({ code: null, signal: null, error: error.message }); });
      child.once('exit', (code, signal) => { live = false; resolve({ code, signal }); });
    });
    return { pid: child.pid ?? -1, started: startedAt, supervisor: process.pid };
  } }); } catch (error) {
    if (child && live && child.pid) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
      const escalation = setTimeout(() => { if (live) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} } }, 1000);
      await completion; clearTimeout(escalation);
    }
    throw error; // Failed publication keeps PENDING; never invent exit evidence.
  }
  const stop = () => {
    if (live && child.pid && !stopping) {
      stopping = true; stoppedAt = Date.now();
      try { process.kill(-child.pid, 'SIGTERM'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
    }
  };
  const timer = setInterval(async () => {
    try {
      if (live && stopping && Date.now() - stoppedAt > 1000) { try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { if (e.code !== 'ESRCH') throw e; } }
      const state = await inspect(cwd);
      if (Date.now() >= state.deadline || ['STOPPING','BLOCKED_UNCERTAIN'].includes(state.phase)) stop();
    } catch { stop(); }
  }, 100);
  const outcome = await completion;
  live = false; clearInterval(timer);
  const groupGone = await observeGroupExit(child.pid);
  const evidence = { ...outcome, pid: child.pid ?? -1, started: startedAt, ended: Date.now(), groupGone };
  const current = await inspect(cwd);
  return transition(cwd, { ...request, expected_revision: current.revision, operation_id: `${request.operation_id}:exit`, action: 'command-exit', data: { id: request.operation_id, nonce, evidence } }, { key: SUPERVISOR });
}

export async function bindWorkerFile(cwd, request, output) {
  const targetDirectory = await realpath(dirname(resolve(output)));
  const locationInfo = await location(cwd);
  assert(![locationInfo.cwd, dirname(locationInfo.root)].some(root => targetDirectory === root || !relative(root, targetDirectory).startsWith('..')), 'capability output must be outside repository');
  let insideRepository = false;
  try { await git(targetDirectory, 'rev-parse', '--show-toplevel'); insideRepository = true; } catch {}
  assert(!insideRepository, 'capability output must be outside repository');
  const token = randomUUID();
  const handle = await open(output, 'wx', 0o600);
  try {
    await handle.writeFile(JSON.stringify({ epoch: request.epoch, token }));
    await handle.sync();
    return await transition(cwd, { ...request, action: 'bind-actor', data: { ...request.data, capability: token } });
  } finally { await handle.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [action, file, capabilityFile] = process.argv.slice(2);
    assert(!action?.startsWith('command-'), 'supervisor-only operation');
    if (action === 'inspect') console.log(JSON.stringify(await inspect(process.cwd()), null, 2));
    else {
      assert(file, 'JSON input file required');
      const input = JSON.parse(await readFile(file, 'utf8'));
      if (action === 'acquire') {
        assert(capabilityFile, 'private capability output path required');
        const result = await acquire(process.cwd(), input);
        await writeFile(capabilityFile, JSON.stringify(result), { mode: 0o600, flag: 'wx' });
        console.log(JSON.stringify({ epoch: result.epoch, revision: result.revision }));
      } else {
        assert(capabilityFile, 'private capability file required');
        const cap = JSON.parse(await readFile(capabilityFile, 'utf8'));
        const request = { ...input, epoch: cap.epoch, token: cap.token, action };
        if (action === 'bind-worker') { const { capabilityOutput, ...data } = input.data; console.log(JSON.stringify(await bindWorkerFile(process.cwd(), { ...request, data }, capabilityOutput))); }
        else console.log(JSON.stringify(action === 'managed-command' ? await managedCommand(process.cwd(), request) : await transition(process.cwd(), request)));
      }
    }
  } catch (error) { console.error(error instanceof SyntaxError ? 'invalid JSON input' : error.message); process.exitCode = 1; }
}
