# PPT-DSL runtime provenance

- Upstream: [HYY-yu/ppt-dsl-generator](https://github.com/HYY-yu/ppt-dsl-generator)
- Commit: [63e043ce681ce79875d3162d1909153ee7e38789](https://github.com/HYY-yu/ppt-dsl-generator/commit/63e043ce681ce79875d3162d1909153ee7e38789)
- Upstream change: [PR #1](https://github.com/HYY-yu/ppt-dsl-generator/pull/1)
- Runtime snapshot: the contents of `assets/ppt-node-dsl-project/` at that commit, including its npm lockfile.

`LICENSE` comes from upstream's root. `fixtures/seed-template/ppt_example.pptx` comes from upstream's `examples/ppt_example.pptx` and is used only for tests. A regular SlideLatch checkout contains the snapshot. Its build and CLI use the checked-in source and npm lockfiles.

Submit shared runtime changes and regression tests to upstream first. Refresh this snapshot from a specific merged commit on GitHub, preserving the upstream paths and updating the commit link above. SlideLatch's named page contract and release review live in `lib/workflow`. Maintain both Skills independently in their own repositories.
