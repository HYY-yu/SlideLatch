# PPT-DSL runtime provenance

- Upstream: [HYY-yu/ppt-dsl-generator](https://github.com/HYY-yu/ppt-dsl-generator)
- Commit: [fe0f5e4f914eb13795b1006b3c04cd285937343c](https://github.com/HYY-yu/ppt-dsl-generator/commit/fe0f5e4f914eb13795b1006b3c04cd285937343c)
- Upstream change: [PR #3](https://github.com/HYY-yu/ppt-dsl-generator/pull/3)
- Runtime snapshot: the contents of `assets/ppt-node-dsl-project/` at that commit, including its npm lockfile.

`LICENSE` comes from upstream's root. `fixtures/seed-template/ppt_example.pptx` comes from upstream's `examples/ppt_example.pptx` and is used only for tests. A regular SlideLatch checkout contains the snapshot. Its build and CLI use the checked-in source and npm lockfiles.

Submit shared runtime changes and regression tests to upstream first. Refresh this snapshot from a specific merged commit on GitHub, preserving the upstream paths and updating the commit link above. SlideLatch's named page contract and release review live in `lib/workflow`. Maintain both Skills independently in their own repositories.
