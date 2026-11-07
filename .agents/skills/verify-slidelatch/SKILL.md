---
name: verify-slidelatch
description: Validate a SlideLatch code change with complete automated checks and the affected browser, OOXML, and native PowerPoint evidence. Use before review or delivery; do not claim visual fidelity from unit tests.
---

# Verify SlideLatch

Read AGENTS.md and docs/team-workflow.md. Determine the exact target commit and affected behavior before running checks. A verifier must not have authored the change it accepts.

## Clean checkout and automated gate

Use a separate worktree at the full target SHA. Preserve the user's uncommitted files. Use Node.js 24 and both lockfiles:

```sh
node --version
npm ci
npm --prefix packages/ppt-dsl ci
npm run verify
git status --short
```

Install dependencies only within the task's authorization. A blocked network or missing cache is a blocker, not permission to weaken network settings. If local installed dependencies are reused, record that fact; it is not a fresh-install test. Record each command's exit code and actual test counts. Do not hide skipped or nested tests. `browser-deck` tests exercise the browser runtime code in Node, not a live browser.

`verify` includes the complete existing `check`, ordinary Next.js build and isolated Cloudflare static build. CI builds local output only and does not deploy. Build artifacts are not screenshots or native Office evidence.

## Affected product behavior

For editor changes, run the app from the target checkout on an unused local port. Read the actual browser state. Check the relevant successful path and interruption/repetition: invalid import, successful replacement, repeat actions, undo/redo, stale proposal rejection, review invalidation, export and re-import. Inspect both Chinese and English surfaces when shared behavior changes. Include viewport and console errors with screenshots. Stop only a server this task started.

For contract/runtime changes, run valid and invalid input cases. Verify object identity, page ordering, source SHA and snapshot binding, unsupported-case rejection, capacity limits and release output atomicity. Confirm that failed publication leaves no usable release directory. Do not create fake review observations or approve probes without viewing them.

For export/visual changes, inspect the actual exported PPTX structure and open that same output in native Microsoft PowerPoint. Record app version, fonts, slide size, affected pages, repair prompt status and comparison screenshots. Review retained objects, text, image crops, charts, tables and relevant layout. SVG or LibreOffice can be supplementary evidence but cannot be called a PowerPoint pass. If native PowerPoint is unavailable, mark native acceptance blocked.

For CI/role-only changes, verify workflow triggers, read-only permissions, pinned Actions, both installs, error propagation and complete checks. Mark product UI/native acceptance not applicable only with a reason tied to the diff.

## Independent result and current SHA

Return the full target SHA, author and verifier identities, command/results, environment, artifact locations, observed failures and untested scope. Keep evidence outside the target code commit or in its PR comment so recording the verdict does not change the SHA being accepted.

Before integration, read the latest remote head and associated CI run. A new push invalidates the previous verdict. If the PR runs a synthetic merge commit, record that run's tested commit and the associated head. Required check status that is missing, failed or unknown blocks merge readiness. Local results alone do not prove GitHub CI success. Even a fully passing result does not authorize merging, auto-merge, deployment or ongoing scheduling.
