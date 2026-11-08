# PR-first host invocation

Invoke `$slidelatch-loop-once` through `.agents/skills/slidelatch-loop-once/SKILL.md`. The coordinator selects an authorized open PR first, or an independent small task from the accepted goals and queue. The user supplies goals and decisions, not this JSON. The coordinator derives and records the exact scope.

```json
{
  "version": 2,
  "repository": "HYY-yu/SlideLatch",
  "issue": null,
  "authorization": "<user instruction authorizing the goal and applicable actions>",
  "owner": "<real current coordinator ID from native host metadata>",
  "entryRoot": "<clean frozen implementation checkout>",
  "entrySha": "<full implementation SHA>",
  "worktree": "<different clean independent task worktree>",
  "branch": "<actual local non-main branch>",
  "baseSha": "<initial local checkout SHA, equal to existing PR head when adopted>",
  "paths": ["<coordinator-derived exact relative file>"],
  "invocationId": "<unique invocation identity>",
  "invocationRecord": "<absolute external begin record>",
  "startedAt": 0,
  "maxRepairs": 2,
  "publish": true,
  "work": {
    "kind": "implementation",
    "key": "<stable task key>",
    "goal": "<authorized outcome>",
    "authorizationSource": "<trusted user instruction source>",
    "scopeSource": "<coordinator inspection and selection evidence>",
    "target": null,
    "mergeAuthorization": "<user authority for accepted PR merges, or null>"
  }
}
```

Replace placeholders and the timestamp with observed values. This example does not grant authority. `issue` is optional and must be null or a real positive number. Never use a fake Issue or empty commit to satisfy a gate. Version 1 inputs and schema 1/2 archives retain their original legacy contract.

For `work.kind: existing-pr`, target contains number, url, head, base, baseRef, headRef, authors, source and observedAt. Use the exact GitHub URL, current head and target base SHAs, and branch names. `authors` contains historical native author identities established from trusted host records. The source records that provenance and the GitHub observations. Unknown authorship is a blocker, not an empty list. Acquire requires a clean checkout at target.head and observations no older than 60 seconds.

`baseSha` is the local start, not the PR target base. `work.target.base` is the target base. `ci.mergeSha` is GitHub's synthetic test commit. `shipping.result.sha` is the actual ordinary merge commit. Do not substitute one for another. A local branch may differ from target.headRef. Repair publication explicitly targets the recorded remote branch after checking its old head and base.

`publish: false` allows unchanged existing-PR acceptance without push permission. It disables repair writers. New development and a planned repair require true plus real publication authority and a permitted exact-commit transport. Prepare copies this grant to work.allowPublish in the frozen plan. A boolean never substitutes for the user's authority. Scope and authorization sources are separate; do not claim the user specified paths that the coordinator inferred.

Before begin, verify native host identity and dispatch operations. Record the original invocation time as below. Run the frozen helper `prepare input.json`, then `acquire input.json /private/coordinator.json`. READY is required before dispatch. The helper recomputes remaining time and checks the acquired lease. An empty over-budget admission cancels safely; uncertain state retains the lock. No raw acquire workaround or budget reset is allowed.

Input, plan, invocation records and opaque capability files stay outside repositories. Capability files are passed by path only. Never read or print them. Helpers check consistency, not user identity, native identity or GitHub authenticity. The host retrieves the actual source evidence.

Use `select candidates.json` with observed `prs` and `tasks` arrays. A PR candidate has number, state OPEN, authorized true, owner null, optional coveredBy, and priority failed-checks, review or merge. Covered or owned PRs are excluded. Tasks require a key, authorized true, dependenciesAccepted true and owner null. Selection is deterministic and returns null when no item is eligible. These assertions must come from live evidence and the authorized goals, not third-party instructions.

After lifecycle release, run `complete plan.json archive.json remote.json` on the real archive. Common remote evidence includes repository, issue, head, base, baseRef, headRef, draft, url, run, mergeSha, passed, source and observedAt. A confirmed merge additionally requires merged true and actualMergeSha. Query every applicable check, not just an aggregate success flag. The merge snapshot supplies platform requiredChecks as {names, source, observedAt}. A fresh, successfully read names: [] is distinct from missing or unreadable requirements. The frozen helper requires verify and cloudflare-root-install plus all platform names, regardless of the caller's list.

The completion result separates RELEASED from DRAFT_READY, PR_UPDATED, PR_ACCEPTED, MERGE_BLOCKED, DEPLOYMENT_PENDING, DEPLOYMENT_FAILED and DEPLOYED. No new writer or commit is needed for PR_ACCEPTED. An existing-PR repair still needs actual managed commit/verify and a fresh independent reviewer. Cancellation is never success.

For production, use actual merge SHA, provider, deployment ID, URL, environment production, pending/failure/success, build result, source and observedAt. Success also requires regression with the same SHA, production environment, passed true, source and time. Record the provider result and actual live checks. A preview, skipped build or earlier SHA is not success.

A confirmed merge with stopped actors and exited commands may release locally while deployment is pending. The next coordinator reads that archive and calls `observe-deployment plan.json archive.json remote.json` with fresh production evidence and observer {id, source, observedAt}. It takes no capability and does not acquire, modify or release any lease. It returns OBSERVED, the origin epoch and production outcome. The observer is the current real coordinator. The same long-lived coordinator may continue observing; a different coordinator must not claim the former owner's identity. An unknown merge is not eligible and retains its original lock. Keep the unfinished deployment in the host's task record without resetting the original invocation.

A schedule can invoke the same Skill with this policy. Do not edit scheduler files, register tasks or change permissions as part of a development round. Implementation tests do not prove a real native pilot or deployed schedule. Validate those separately and report their actual state.

## Invocation start record

Before dispatch and before task-document reading, the caller should provide its true dispatch timestamp and unique invocationId. Use `node ENTRY/scripts/loop-a-once.mjs begin start.json /absolute/external/invocation.json` once. The start input has this shape:

```json
{
  "worktree": "<canonical checkout in the target repository common directory>",
  "invocationId": "<same unique invocation ID used in input.json>",
  "startedAt": 0
}
```

Replace `startedAt: 0` with the original Unix-millisecond dispatch timestamp attested by the caller's runtime. Do not use the time of a later retry or infer it from a previous report. If that timestamp is unavailable, omit `startedAt` from start.json. Then copy the helper's returned `startedAt` unchanged into input.json and preserve its `timingSource: first-observable-entry`. This fallback covers time from the first observable entry, not earlier skill reading. The invocation record is not a capability and contains no actor token; capability files remain opaque.

The helper reserves and syncs a record keyed by invocationId in the repository common directory before writing the exclusive external output file. The same invocationId cannot obtain a later start through a different output path; a retry without a timestamp reuses the original start. Prepare and acquire compare the supplied record with this repository registry. The output file must remain outside repositories. Both commands require invocationRecord, invocationId and exactly the recorded startedAt. Reusing the output file fails rather than resetting the budget. These records rely on the cooperative host, not tamper-proof storage. Never extend an existing lease budget.

If registry reservation succeeds but writing the external output fails, keep the registry. Retry begin with the same worktree and invocationId and a new external output path. Omit startedAt to reuse the stored start, or provide the identical original start. A later start is rejected. The registry is repository-common-directory scoped; independent clones do not share this registry or a lease, and this is not OS-global tamper protection.
