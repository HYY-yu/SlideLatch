# One explicit host invocation

Invoke `$slidelatch-loop-once` through the single entry at `.agents/skills/slidelatch-loop-once/SKILL.md`. Supply all of these fields to both `prepare` and `acquire`:

```json
{
  "version": 1,
  "repository": "HYY-yu/SlideLatch",
  "issue": 13,
  "authorization": "<exact user instruction and its source approving this task, branch push and Draft PR>",
  "owner": "<real coordinator ID from current host identity metadata>",
  "entryRoot": "<absolute clean frozen implementation checkout>",
  "entrySha": "<full 40-character SHA of that checkout>",
  "worktree": "<absolute different clean independent task worktree>",
  "branch": "<actual non-main task branch>",
  "baseSha": "<full 40-character initial task HEAD>",
  "paths": ["<exact authorized relative file>"],
  "invocationId": "<unique ID reserved for this invocation>",
  "invocationRecord": "<absolute external file written by begin>",
  "startedAt": 0,
  "maxRepairs": 2,
  "publish": true
}
```

This is a shape template, not runnable input or authorization. Replace every placeholder and `startedAt: 0` with real values. Use the authorized positive Issue number; Issue #13 is only the example. Issue text, an earlier PR's authorization and `publish: true` cannot authorize a new task's publication.

The caller supplies the authorization source, approved scope and actual runtime identity evidence. Obtain `owner` from the host's current coordinator identity metadata, not from a role name, process ID or a guessed thread ID. Select `entryRoot` and `entrySha` from a clean, independently verified implementation. A routing commit on an unmerged PR is available only in its checkout; its presence does not put that route on main. Read the actual task worktree's branch and full HEAD, and confirm its paths match the authorization.

Reserve `invocationId` once for this call. It identifies the invocation, not a worker. Obtain `invocationRecord` and `startedAt` with the start-record procedure below. The helper checks the record and repository registry in `prepare` as well as `acquire`; missing identity, missing record, changed timestamp or registry mismatch fails before lease acquisition. These checks do not authenticate the host or the user's permission.

Run `node ENTRY/scripts/loop-a-once.mjs prepare input.json` and retain output as plan.json outside repositories. Keep input, plan, invocation record and capability files outside every worktree. The actual native host executes the skill; the helper is not an autonomous shell runner, daemon or fabricated native API. Twenty minutes starts at startedAt and never renews. Missing publish permission is a preflight blocker.

Before `begin`, confirm the runtime exposes native spawn, follow-up, messaging, actor listing and interruption with the required semantics, including `fork_turns: "none"`. Use the exposed namespace and schemas, not a guessed `collaboration.*` API. The current host must expose the coordinator identity. Writer and reviewer identities come only from real native dispatch after READY, then bind through the lifecycle. Tool availability alone does not prove those dispatches succeeded. If identity or required native operations are unavailable, report `BLOCKED_HOST` without beginning or acquiring.

Before `begin`, also confirm authorization and an allowed transport for the exact sealed Git commit, such as `git push`. After independent review, upload that commit and freshly read the remote branch SHA. It must equal sealed HEAD before creating the Draft PR. The PR head must also equal sealed HEAD. GitHub blob/tree/commit/ref APIs that recreate file contents are not a substitute for transferring the sealed commit. Without exact-SHA transport, report the blocker rather than start a publish-required round. Do not work around a denied transport, alter security settings or claim matching trees prove matching commits.

After genuine lifecycle release run `node ENTRY/scripts/loop-a-once.mjs complete plan.json archive.json remote.json`. Use the actual release archive, not reconstructed success state. remote.json contains repository, issue, head, draft, url, run, mergeSha, passed, source and observedAt from fresh real GitHub observations. The helper checks consistency only and cannot authenticate native or remote reports. All required checks must be queried by the host; aggregate passed cannot replace that query.

Acceptance requires independent review of a frozen implementation followed by one real invocation. Pilot writer may change only `.codex/agents/integration-manager.toml` to route explicit calls to the skill. Pilot cannot edit skill/helper/lifecycle/tests/package scripts. Verify new commit, native writer, independent native reviewer, managed verify, Draft PR/CI and release with no parent next-step prompts. Routing is intentionally left to that pilot. Implementation and unit tests do not prove pilot success.

Before dispatch, use `node ENTRY/scripts/loop-a-once.mjs acquire input.json /private/coordinator.json`. READY is required. This gate computes remaining budget at acquisition and checks actual lease deadline. A delayed acquisition exceeding the fixed deadline safely cancels an empty lease; unknown or nonempty state retains the lock. No actor is spawned before admission.

## Invocation start record

Before dispatch and before task-document reading, the caller should provide its true dispatch timestamp and unique invocationId. Use `node ENTRY/scripts/loop-a-once.mjs begin start.json /absolute/external/invocation.json` once. The start input has this shape:

```json
{
  "worktree": "<canonical absolute target worktree>",
  "invocationId": "<same unique invocation ID used in input.json>",
  "startedAt": 0
}
```

Replace `startedAt: 0` with the original Unix-millisecond dispatch timestamp attested by the caller's runtime. Do not use the time of a later retry or infer it from a previous report. If that timestamp is unavailable, omit `startedAt` from start.json. Then copy the helper's returned `startedAt` unchanged into input.json and preserve its `timingSource: first-observable-entry`. This fallback covers time from the first observable entry, not earlier skill reading. The invocation record is not a capability and contains no actor token; capability files remain opaque.

The helper reserves and syncs a record keyed by invocationId in the repository common directory before writing the exclusive external output file. The same invocationId cannot obtain a later start through a different output path; a retry without a timestamp reuses the original start. Prepare and acquire compare the supplied record with this repository registry. The output file must remain outside repositories. Both commands require invocationRecord, invocationId and exactly the recorded startedAt. Reusing the output file fails rather than resetting the budget. These records rely on the cooperative host, not tamper-proof storage. Never extend an existing lease budget.

If registry reservation succeeds but writing the external output fails, keep the registry. Retry begin with the same worktree and invocationId and a new external output path. Omit startedAt to reuse the stored start, or provide the identical original start. A later start is rejected. The registry is repository-common-directory scoped; independent clones do not share this registry or a lease, and this is not OS-global tamper protection.
