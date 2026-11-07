# PPT-DSL runtime provenance

Vendored on 2026-11-07 from the locally installed ppt-node-dsl-generator skill, assets/ppt-node-dsl-project (package version 0.1.0). Upstream repository declared by its package: https://github.com/HYY-yu/ppt-dsl-generator.git. No upstream commit identifier was provided by the installed distribution. MIT license is preserved in LICENSE.

Source, package lock, tests, and fixtures are copied rather than runtime-linked. Dependencies remain an independent npm package. The public example PPTX is retained solely as a regression fixture; production commands require explicit inputs. No customer documents are included.

Integration additions: reusable compile/index APIs, deterministic template candidate filtering/ranking, select-template CLI, and compile/repeat-generation regression checks. Raw compile is not a browser review or visual acceptance guarantee. Full DeckInput validation and exact-template fingerprint enforcement are retained.

Local development may reuse an ignored node_modules symlink; this is not a dependency source or deployment requirement. Install reproducibly with npm ci in this directory when authorized.
