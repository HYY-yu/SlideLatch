# Generate a source-based PPTX after acceptance

All commands run from the SlideLatch repository root. Use its `packages/ppt-dsl` runtime and existing locked dependencies. The AI executes this workflow; the user does not import JSON, replace pages or operate a final-deck editor.

Inputs are the exact accepted marked PPTX, its byte-bound review when available, the user's generation brief or approved outline, and authorized source materials/assets. Outputs are the compiled template package, private DeckInput and validation evidence, and the generated PPTX. Keep intermediate files local and never overwrite the source.

## Compile the accepted file

For a reviewed release, extract the actual Studio review download and run:

```sh
npm run template:release -- --template /absolute/review/marked.pptx \
  --review /absolute/review/workflow-review.json --out /absolute/new-reviewed-template
```

Release validates exact bytes, current contracts and required observations. The output directory must not exist. Missing or stale evidence stops release; human confirmation does not synthesize that evidence.

If release evidence is incomplete and a draft is appropriate to the user's request, compile explicitly as a draft:

```sh
npm run template:compile -- --template /absolute/review/marked.pptx --out /absolute/new-draft-template
```

Compilation emits `template.pptx`, `template-manifest.json`, `input.schema.json`, `deck-content.schema.json`, `template-lint.json` and `template.lock.json`. Stop on lint errors. Keep all runtime locators, physical `slidePath`, template SHA, Manifest and lock together. Do not hand-edit a shortened Manifest or reuse one from another template version.

## Plan content within actual capacity

Read the Manifest before writing an outline. For each directory-page candidate, sum its lists' possible item counts. Union those totals across candidates and intersect with the runtime's 3–6 chapter rule. An empty feasible set is a template limitation to report, not permission to relax validation.

The current runtime requires first-page cover, exactly one second-page contents, 3–6 chapter transitions, at least one content page per chapter, and a final closing page. Directory item count equals transition count. Arbitrary short decks and a `deckPolicy` override are not implemented CLI capabilities.

Use the user's approved outline when it exists. Otherwise organize the brief and materials into a concise outline for confirmation before filling. Include each page's role, title, key message, ordered logic preferences, visual needs and source references. Mark assumptions and unresolved facts. Template-marking acceptance and content-outline approval are different decisions; do not repeat an approval already given.

If only a topic is supplied, choose appropriate sources using available authorized tools. Do not force a source-mode questionnaire. Research current or consequential claims with reliable primary sources, and retain references. Use clearly labeled assumptions when facts cannot be established. Do not copy the template's sample claims or example deck into the new report.

## Select existing layouts

Write one candidate request per intended page, for example:

```json
{"pageType":"内容页","listCounts":{"list_1":3},"availableAssetKinds":[],"logic":["并列"],"usedTemplateIds":[]}
```

Use actual logic labels and list keys from the Manifest. `availableAssetKinds` is required; include `image`, `icon` or `background` only if authorized local resources can be bound. Then run:

```sh
npm run template:select -- --manifest /absolute/compiled/template-manifest.json \
  --request /absolute/candidate-request.json
```

This returns candidates, not a complete DeckInput. It filters by page role, requested list capacities and asset kinds, then ranks ordered logic mismatches, capacity slack, reuse count and stable template ID. The AI still matches page intent to `sampleContent` and verifies every selected list's actual capacity. No candidate means revise the content plan within its approved intent or report the missing layout; do not rebuild a page.

## Fill and validate in two stages

Use only the selected Manifest's `templateId`, page `nodes` keys, list keys and component keys. A minimal structural example is:

```json
{"title":"Report title","slides":[{"templateId":"slide_008","nodes":{"text_1":"A sourced title"},"lists":{"list_1":[{"text_1":"First item"}]},"sourceRefs":["source-1"]}]}
```

This example is not a valid complete deck by itself. Build the full required sequence using the actual compiled template.

Freeze front matter, each chapter and closing as stable batches. Use the approved outline and source materials together. Draft only text, native table/chart data and list structure, with `sampleContent` and exact length/capacity constraints visible to the AI. The source materials supply facts; slot examples supply meaning. Plain strings are the default; [PPT-DSL contracts](ppt-dsl-contracts.md) defines optional long-field rich text and native data.

```sh
npm run deck:validate -- --manifest /absolute/compiled/template-manifest.json \
  --input /absolute/deck-content.json --content-only
```

Content mode still checks the full deck sequence, list capacities, text lengths and data structure. It rejects supplied number/image/icon/background fields and palette; these are bound after the content passes. It is not a partial-chapter validator, so assemble the full candidate before this command.

Bind authorized local assets deterministically to the intended page/item slots. Omitted numbers are filled by the CLI from chapter or list order. Preserve source colors unless explicit theme changes were requested. Then validate the final input:

```sh
npm run deck:validate -- --manifest /absolute/compiled/template-manifest.json \
  --input /absolute/deck-input.json
```

Do not silently accept missing assets or unknown fields. Repair only reported paths while preserving accepted content and page bindings. Use text replacement for a text field, whole-object replacement for table/chart data, whole-list replacement for structural list errors, and removal for extra fields. These are editing operations performed by the AI, not extra CLI subcommands. Revalidate after each repair. Stop and report if the same error fingerprint persists for three rounds; do not loop indefinitely or regenerate the whole accepted draft.

## Generate and check the actual file

```sh
npm run deck:generate -- --template /absolute/compiled/template.pptx \
  --manifest /absolute/compiled/template-manifest.json \
  --input /absolute/deck-input.json --out /absolute/result.pptx
npm run deck:verify -- --pptx /absolute/result.pptx
```

Generation reuses source slides, masters, object geometry and styling through declared locators. It checks the template SHA and complete runtime Manifest. Only declared content slots and explicitly enabled contracts change. Generated output may omit source notes and unselected parts and clean dangling animation references; report applicable preservation limits rather than promising byte-for-byte copying.

Any failure leaves the result unsuitable for delivery. Retain the input and full reported error, identify the page/object when possible, and fix the cause. Never hide an exception or substitute another template.

`deck:verify` checks the generated consumer artifact's OOXML package. Do not run that consumer gate on the marked authoring file and strip its necessary DSL/notes to make it pass. Source/marked fidelity checks, generated package checks, approximate SVG observations, business-fact checks and native PowerPoint checks answer different questions.

Before delivering, check generated page count/order, actual filled text/data, unintended object/geometry changes, relationship/media integrity and source identity. Use native PowerPoint for required visual fidelity and editability checks. A package pass does not establish font fidelity, no clipping, correct animations, a repair-free Office open or user acceptance. Preserve the repo's release/native requirements; the older standalone PPT-DSL skill's programmatic-only QA default does not apply here.

Deliver the actual PPTX link and a short account of checks performed, draft/release status and remaining limits. Keep internal JSON and technical operations within the Skill workflow unless the user asks for them.
