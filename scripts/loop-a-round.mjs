import { mkdir, readFile, writeFile, rmdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
const exec = promisify(execFile);
export async function round({ cwd, input = {}, timeoutMs = 1200000, attempts = 2 }) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 1200000 || !Number.isInteger(attempts) || attempts < 1 || attempts > 2) throw Error('invalid budget');
  const deadline = Date.now() + timeoutMs;
  const git = async (...args) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw Error('timeout');
    return (await exec('git', ['--no-optional-locks', '-C', cwd, ...args], { timeout: remaining, maxBuffer: 1048576, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })).stdout.trim();
  };
  const common = resolve(cwd, await git('rev-parse', '--git-common-dir'));
  const own = resolve(cwd, await git('rev-parse', '--git-dir'));
  if (own === common) return { status: 'independent-worktree-required' };
  const state = join(common, 'loop-a');
  await mkdir(state, { recursive: true });
  const lock = join(state, 'lock');
  try { await mkdir(lock); } catch (e) { if (e.code === 'EEXIST') return { status: 'busy' }; throw e; }
  const run = { id: randomUUID(), issue: input.issue ?? null, phases: [], status: 'started' };
  const event = (phase, evidence = {}) => run.phases.push({ phase, at: new Date().toISOString(), ...evidence });
  const ledger = join(state, `${run.id}.json`);
  try {
    await writeFile(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, run: run.id }));
    event('acquired');
    await writeFile(ledger, JSON.stringify(run));
    let reason;
    if (!Number.isSafeInteger(input.issue) || input.issue <= 0) reason = 'no-eligible-issue';
    else if (input.authorized !== true || typeof input.authorization !== 'string' || !input.authorization.trim()) reason = 'authorization-required';
    else if (input.dependenciesAccepted !== true) reason = 'dependency-wait';
    else if (input.prPending !== false) reason = 'pr-acceptance-wait';
    else if (input.confirmationRequired !== false) reason = 'confirmation-required';
    else if (input.guiRequired !== false) reason = 'gui-queued';
    else if (input.action !== 'inspect') reason = 'forbidden-action';
    let history = { blocked: 0, stagnant: 0 };
    const historyPath = Number.isSafeInteger(input.issue) && input.issue > 0 ? join(state, `issue-${input.issue}.json`) : null;
    if (historyPath) {
      try { history = JSON.parse(await readFile(historyPath, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    if (history.paused) reason = 'issue-paused';
    if (!reason) {
      for (let attempt = 1; attempt <= attempts; attempt++) {
        event('inspection', { attempt });
        try {
          const head = await git('rev-parse', 'HEAD');
          const status = await git('status', '--porcelain');
          event('evidence', { head, status });
          history.stagnant = history.head === head ? history.stagnant + 1 : 1;
          history.head = head;
          history.blocked = 0;
          run.status = 'inspected';
          break;
        } catch (e) {
          reason = Date.now() >= deadline || e.killed ? 'timeout' : 'inspection-failed';
          event(reason);
          if (reason === 'timeout' || attempt === attempts) break;
          reason = undefined;
        }
      }
    }
    if (reason) {
      run.status = reason;
      history.blocked = history.reason === reason ? history.blocked + 1 : 1;
      history.reason = reason;
    }
    history.paused ||= history.blocked >= 2 || history.stagnant >= 2;
    run.paused = Boolean(history.paused);
    event('finished', { status: run.status });
    if (historyPath) await writeFile(historyPath, JSON.stringify(history));
    await writeFile(ledger, JSON.stringify(run, null, 2));
    return run;
  } finally {
    // Never reclaim a previous owner's lock, including after a crash.
    const { unlink } = await import('node:fs/promises');
    await unlink(join(lock, 'owner.json'));
    await rmdir(lock);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const input = process.argv[2] ? JSON.parse(await readFile(process.argv[2], 'utf8')) : {};
  try { console.log(JSON.stringify(await round({ cwd: process.cwd(), input }), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
