import { mkdir, readFile, writeFile, rename, rmdir, realpath, lstat } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
const exec = promisify(execFile);
const digest = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const assert = (x, message) => { if (!x) throw Error(message); };
const git = async (cwd, ...args) => (await exec('git', ['--no-optional-locks', '-C', cwd, ...args])).stdout.trim();
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
}
function valid(s) {
  assert(s && s.version === 1 && typeof s.epoch === 'string' && Number.isSafeInteger(s.revision) && s.revision >= 0 && Array.isArray(s.authors) && Array.isArray(s.actors) && s.operations && Number.isFinite(s.deadline) && ['ACTIVE','SEALED','REVIEWED','PR','CI','STOPPING','QUIESCENT','RELEASED','BLOCKED_UNCERTAIN'].includes(s.phase), 'invalid lifecycle state');
  const keys = 'version epoch revision phase issue authorization owner cwd branch base head paths deadline coordinator actors authors operations repair review pr ci commands stopEvidence progress stagnant'.split(' ').sort();
  assert(Object.keys(s).sort().join() === keys.join(), 'unknown state fields');
  assert(Number.isSafeInteger(s.issue) && s.issue > 0 && [s.authorization,s.owner,s.cwd,s.branch].every(x => typeof x === 'string' && x.length) && /^[a-f0-9]{40,64}$/.test(s.base) && /^[a-f0-9]{40,64}$/.test(s.head) && /^[a-f0-9]{64}$/.test(s.coordinator), 'invalid state metadata');
  assert(Array.isArray(s.paths) && s.paths.length && s.paths.every(x => typeof x === 'string') && Array.isArray(s.commands) && s.authors.every(x => typeof x === 'string') && Number.isSafeInteger(s.repair) && s.repair >= 0 && s.repair <= 2 && Number.isSafeInteger(s.stagnant) && s.stagnant >= 0 && s.stagnant <= 2, 'invalid state collections');
  for (const a of s.actors) assert(Object.keys(a).sort().join() === 'capability,id,intent,role,stopped' && ['writer','reviewer'].includes(a.role) && typeof a.intent === 'string' && (a.id === null || typeof a.id === 'string') && (a.capability === null || /^[a-f0-9]{64}$/.test(a.capability)) && typeof a.stopped === 'boolean', 'invalid actor schema');
  assert(s.actors.filter(a => a.role === 'writer' && !a.stopped).length <= 1, 'multiple writers');
  assert(s.operations && Object.getPrototypeOf(s.operations) === Object.prototype && !Array.isArray(s.operations), 'invalid operations');
  for (const op of Object.values(s.operations)) assert(op && Object.keys(op).sort().join() === 'payload,result' && /^[a-f0-9]{64}$/.test(op.payload) && op.result?.epoch === s.epoch && Number.isSafeInteger(op.result.revision), 'invalid operation record');
  for (const c of s.commands) assert(c && Object.keys(c).sort().join() === 'actor,exit,id,label,nonce,status' && typeof c.id === 'string' && typeof c.actor === 'string' && typeof c.nonce === 'string' && ['verify','commit'].includes(c.label) && ['PENDING','EXITED','UNCERTAIN'].includes(c.status), 'invalid command record');
  return s;
}
export async function acquire(cwd, input) {
  const p = await location(cwd);
  assert(Number.isSafeInteger(input.issue) && input.issue > 0 && input.authorization?.trim() && input.owner?.trim() && Array.isArray(input.paths) && input.paths.length, 'issue, authorization, owner and paths required');
  for (const path of input.paths) await checkedPath(p.cwd, path);
  const timeout = input.timeoutMs ?? 1200000;
  assert(Number.isSafeInteger(timeout) && timeout > 0 && timeout <= 1200000, 'invalid deadline');
  await mkdir(p.root, { recursive: true });
  await mkdir(p.lock); // Existing/creating/crashed locks are never reclaimed.
  const token = randomUUID();
  const s = { version: 1, epoch: randomUUID(), revision: 0, phase: 'ACTIVE', issue: input.issue, authorization: input.authorization, owner: input.owner, cwd: p.cwd, branch: await git(cwd, 'branch', '--show-current'), base: await git(cwd, 'rev-parse', 'HEAD'), head: await git(cwd, 'rev-parse', 'HEAD'), paths: input.paths, commands: [], stopEvidence: null, progress: null, stagnant: 0, deadline: Date.now() + timeout, coordinator: digest(token), actors: [], authors: [], operations: {}, repair: 0, review: null, pr: null, ci: null };
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
    try { assert(!(await lstat(current)).isSymbolicLink(), 'symlink forbidden'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return dest;
}
export async function inspect(cwd) {
  const p = await location(cwd);
  const s = valid(JSON.parse(await readFile(join(p.lock, 'state.json'), 'utf8')));
  const { coordinator, operations, ...safe } = s;
  return { ...safe, commands: safe.commands.map(({ nonce, ...command }) => command), actors: safe.actors.map(({ capability, ...actor }) => actor) };
}
export async function transition(cwd, request) {
  const p = await location(cwd);
  if (request.action === 'release' && /^[a-f0-9-]{36}$/.test(request.epoch)) {
    try { await lstat(p.lock); } catch (e) { if (e.code !== 'ENOENT') throw e; p.lock = join(p.root, `released-${request.epoch}`); }
  }
  let tx = join(p.lock, 'transaction');
  await mkdir(tx); // A crashed transaction intentionally blocks recovery.
  try {
    const s = valid(JSON.parse(await readFile(join(p.lock, 'state.json'), 'utf8')));
    assert(s.cwd === p.cwd && request.epoch === s.epoch, 'wrong worktree or stale epoch');
    const coordinator = digest(request.token) === s.coordinator;
    const actor = s.actors.find(a => a.capability === digest(request.token));
    assert(coordinator || actor, 'invalid capability');
    assert(typeof request.operation_id === 'string' && request.operation_id.length > 0, 'operation_id required');
    const payload = digest({ action: request.action, data: request.data, actor: coordinator ? 'coordinator' : actor.id });
    assert(!['__proto__','constructor','prototype'].includes(request.operation_id), 'invalid operation ID');
    const prior = Object.hasOwn(s.operations, request.operation_id) ? s.operations[request.operation_id] : null;
    if (prior) { assert(prior.payload === payload, 'operation payload conflict'); return prior.result; }
    assert(request.expected_revision === s.revision, 'revision conflict');
    const d = request.data ?? {};
    if (Date.now() >= s.deadline && !['request-stop','confirm-quiescent','release','command-exit'].includes(request.action)) {
      s.phase = 'STOPPING'; s.revision++; await atomic(join(p.lock, 'state.json'), s); throw Error('deadline reached; lock retained');
    }
    if (['record-review','record-pr','record-ci','release'].includes(request.action) && await git(cwd, 'rev-parse', 'HEAD') !== s.head) {
      s.review = s.ci = null; s.phase = 'BLOCKED_UNCERTAIN'; s.revision++;
      await atomic(join(p.lock, 'state.json'), s); throw Error('head changed; evidence invalidated');
    }
    const needCoordinator = () => assert(coordinator, 'coordinator required');
    switch (request.action) {
      case 'dispatch-intent':
        needCoordinator(); assert((d.role === 'writer' && s.phase === 'ACTIVE' || d.role === 'reviewer' && s.phase === 'SEALED') && !s.actors.some(a => !a.stopped), 'invalid dispatch or active actor');
        s.actors.push({ intent: randomUUID(), role: d.role, id: null, capability: null, stopped: false }); break;
      case 'bind-actor': {
        needCoordinator(); const a = s.actors.find(a => a.intent === d.intent);
        assert(a && !a.id && !a.stopped && typeof d.id === 'string' && d.id.length && typeof d.capability === 'string' && d.capability.length >= 32, 'invalid binding');
        assert(!s.actors.some(a => a.id === d.id) && (a.role !== 'reviewer' || !s.authors.includes(d.id)), 'identity conflict');
        a.id = d.id; a.capability = digest(d.capability); if (a.role === 'writer') s.authors.push(d.id); break;
      }
      case 'write': {
        assert(actor?.role === 'writer' && !actor.stopped && s.phase === 'ACTIVE' && s.paths.includes(d.path) && typeof d.content === 'string', 'write forbidden');
        await writeFile(await checkedPath(cwd, d.path), d.content); s.review = s.ci = null; break;
      }
      case 'command-intent':
        assert(actor?.role === 'writer' && !actor.stopped && s.phase === 'ACTIVE' && ['verify','commit'].includes(d.label) && typeof d.nonce === 'string' && !s.commands.some(c => c.status !== 'EXITED'), 'command forbidden');
        s.commands.push({ id: request.operation_id, actor: actor.id, label: d.label, nonce: d.nonce, status: 'PENDING', exit: null }); break;
      case 'command-exit': {
        const c = s.commands.find(c => c.id === d.id);
        assert(actor && c?.actor === actor.id && c.status === 'PENDING' && c.nonce === d.nonce && d.evidence && typeof d.evidence.started === 'number' && typeof d.evidence.pid === 'number', 'command ownership evidence required');
        c.status = d.evidence.groupGone === true && (Number.isInteger(d.evidence.code) || typeof d.evidence.signal === 'string') ? 'EXITED' : 'UNCERTAIN'; c.exit = d.evidence;
        if (c.status === 'UNCERTAIN') s.phase = 'BLOCKED_UNCERTAIN'; break;
      }
      case 'repair':
        needCoordinator(); assert(['SEALED','REVIEWED','PR','CI'].includes(s.phase) && s.actors.every(a => a.stopped) && s.repair < 2 && s.stagnant < 2 && d.evidence?.trim(), 'repair budget or actor gate');
        s.stagnant = s.progress === d.evidence ? s.stagnant + 1 : 1; s.progress = d.evidence; s.repair++;
        s.review = s.pr = s.ci = null; s.phase = s.stagnant >= 2 ? 'BLOCKED_UNCERTAIN' : 'ACTIVE'; break;
      case 'request-stop': needCoordinator(); s.phase = 'STOPPING'; break;
      case 'confirm-quiescent':
        needCoordinator(); assert(d.evidence?.trim() && s.commands.every(c => c.status === 'EXITED') && s.actors.every(a => a.id && d.stopped_ids?.includes(a.id)), 'positive actor stop evidence required');
        s.actors.forEach(a => { a.stopped = true; }); s.stopEvidence = d.evidence; if (!['SEALED','REVIEWED','PR','CI'].includes(s.phase)) s.phase = 'QUIESCENT'; break;
      case 'seal-writer':
        needCoordinator(); assert(s.phase === 'QUIESCENT' && !(await git(cwd, 'status', '--porcelain')), 'clean quiescent worktree required');
        s.head = await git(cwd, 'rev-parse', 'HEAD'); s.phase = 'SEALED'; break;
      case 'record-review':
        assert(actor?.role === 'reviewer' && !actor.stopped && !s.authors.includes(actor.id) && s.phase === 'SEALED' && d.head === s.head && d.evidence?.trim() && d.passed === true, 'independent review required');
        assert(await git(cwd, 'rev-parse', 'HEAD') === s.head, 'head changed'); s.review = { ...d, actor: actor.id }; s.phase = 'REVIEWED'; break;
      case 'record-pr':
        needCoordinator(); assert(s.phase === 'REVIEWED' && d.draft === true && d.head === s.head && d.url?.startsWith('https://github.com/'), 'reviewed draft required'); s.pr = d; s.phase = 'PR'; break;
      case 'record-ci':
        needCoordinator(); assert(s.phase === 'PR' && d.head === s.head && d.mergeSha && d.run && d.passed === true, 'current CI required'); s.ci = d; s.phase = 'CI'; break;
      case 'release':
        needCoordinator(); assert(['CI','QUIESCENT'].includes(s.phase) && s.actors.every(a => a.stopped) && await git(cwd, 'rev-parse', 'HEAD') === s.head, 'release evidence missing'); s.phase = 'RELEASED'; break;
      default: throw Error('unsupported action');
    }
    s.revision++;
    const result = { epoch: s.epoch, revision: s.revision, phase: s.phase };
    s.operations[request.operation_id] = { payload, result };
    valid(s);
    await atomic(join(p.lock, 'state.json'), s);
    if (s.phase === 'RELEASED') { const archive = join(p.root, `released-${s.epoch}`); await rename(p.lock, archive); tx = join(archive, 'transaction'); }
    return result;
  } finally { await rmdir(tx).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
}

// Foreground supervisor: only this live ChildProcess handle authorizes signals.
// A crashed supervisor leaves PENDING evidence and the lease held indefinitely.
export async function managedCommand(cwd, request) {
  const label = request.data?.label;
  assert(['verify', 'commit'].includes(label), 'unknown managed command');
  const paths = await location(cwd);
  const before = valid(JSON.parse(await readFile(join(paths.lock, 'state.json'), 'utf8')));
  const prior = before.commands.find(c => c.id === request.operation_id);
  const nonce = prior?.nonce ?? randomUUID();
  const started = await transition(cwd, { ...request, action: 'command-intent', data: { label, nonce } });
  if (prior) {
    assert(prior.status === 'EXITED', 'existing command outcome uncertain; never respawn');
    return transition(cwd, { ...request, operation_id: `${request.operation_id}:exit`, action: 'command-exit', data: { id: request.operation_id, nonce, evidence: prior.exit } });
  }
  const startedAt = Date.now();
  let command = 'npm', args = ['run', 'verify'];
  if (label === 'commit') {
    const dirty = (await git(cwd, 'diff', '--name-only', 'HEAD')).split('\n').filter(Boolean);
    const untracked = (await git(cwd, 'ls-files', '--others', '--exclude-standard')).split('\n').filter(Boolean);
    assert([...dirty, ...untracked].every(path => before.paths.includes(path)), 'unapproved changes; command remains uncertain');
    for (const path of before.paths) await checkedPath(cwd, path);
    await git(cwd, 'add', '--', ...before.paths);
    command = 'git'; args = ['commit', '-m', `[CF-Pages-Skip] Update approved writer paths. Refs #${before.issue}`];
  }
  const child = spawn(command, args, { cwd, detached: true, stdio: 'inherit' });
  let live = true, stopping = false, stoppedAt = null;
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
  const outcome = await new Promise(resolve => {
    child.once('error', error => resolve({ code: null, signal: null, error: error.message }));
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  live = false; clearInterval(timer);
  let groupGone = false;
  if (child.pid) {
    try { process.kill(-child.pid, 0); } catch (e) { groupGone = e.code === 'ESRCH'; }
  }
  const evidence = { ...outcome, pid: child.pid ?? -1, started: startedAt, ended: Date.now(), groupGone, nonce };
  const current = await inspect(cwd);
  return transition(cwd, { ...request, expected_revision: current.revision, operation_id: `${request.operation_id}:exit`, action: 'command-exit', data: { id: request.operation_id, nonce, evidence } });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [action, file, capabilityFile] = process.argv.slice(2);
    assert(!['command-intent','command-exit'].includes(action), 'supervisor-only operation');
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
        console.log(JSON.stringify(action === 'managed-command' ? await managedCommand(process.cwd(), request) : await transition(process.cwd(), request)));
      }
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
