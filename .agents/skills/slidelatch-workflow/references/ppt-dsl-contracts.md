# PPT-DSL contracts used by SlideLatch

Use the current compiled Manifest and generated schemas as the authoritative field contract. The implementation is in `packages/ppt-dsl/src/types.ts`, `dsl/parse.ts`, `lint.ts`, `schema.ts` and `validation.ts`, relative to the repository root. These references belong to the unified SlideLatch skill and need no separately installed skill.

## Mark original objects

Only mark existing objects whose editable role is supported by the user's intent and source evidence. Keep the original file unchanged. The workflow proposal can rename objects and write dedicated page contracts; it cannot rebuild groups, rewrite slide content or change geometry. Ambiguous structures stay fixed until resolved.

Page roles are 封面页、目录页、章节过渡页、内容页、结尾页. Existing notes may contain a `#页面类型` section followed by `@内容页`, and a `#逻辑关系` section containing ordered labels. SlideLatch writes its dedicated `slidelatch-page-contract` note object and preserves unrelated speaker notes. Prefer the workflow pages proposal over editing arbitrary notes.

Common object names are:

```text
@文本[4-18]
@文本[6]
@图片-1
@图标
@背景
@序号-01
@表格
@图表
```

Text requires a fixed length or range. `@文本框` is a legacy alias. Number suffix width controls zero padding; page-level numbers are supported only on chapter transition pages. Final validation and generation bind omitted numbers deterministically. `runtime-page-number` is a separate exact name for actual output page numbers. Never rename arbitrary numerical footers into this role without evidence.

## Preserve list boundaries

Fixed list components use `@listId@itemId` prefixes:

```text
@1@1 文本[4-10]
@1@1 序号-01
@1@2 文本
@1@2 序号
```

The first item declares the component contract. Later items inherit it. Item IDs start at 1 and remain consecutive. All items must have uniquely matchable component kinds and counts.

For a list of actual PowerPoint Groups, the Group names are `@1@1`, `@1@2`, and so on. The first Group may declare a range, for example `@1@1[3-5]`; later Groups must not repeat a range. No range means the existing Group count is fixed. Components inside Groups use ordinary names such as `@文本[4-10]`; they do not repeat the list prefix.

Do not infer icon/text pairing from distance. Pairing comes from belonging to the same item. Do not convert scattered objects into a resizable Group list through a rename proposal. Keep borders, decorations and connectors with their intended item when the source already groups them. New variable lists should be prepared and reviewed at maximum density, including required per-item animations; runtime-created copies do not guarantee animation inheritance.

Manifest `componentContract` is an array indexed by each entry's `key`, not a map. It contains inherited kinds, ranges and semantic examples. `items[].components` contains actual locators. Never derive later items' text limits from the first generated value. Keep original Group geometry when count is unchanged; count changes use the runtime's supported layout rules, with separate visual checks.

## Fill text without changing the contract

Length counts visible Unicode code points. Leading and trailing whitespace is ignored, internal whitespace collapses to one, format-control characters and nonstandard whitespace are rejected. Never pad with invisible characters or mechanically truncate a title. Rewrite a complete phrase within the range. Short ranges with maximum at most 10 retain their full original bounds if applying any generation safety margin.

`sampleContent` describes the slot's meaning. Include it when reasoning about a field, but never treat it as user facts, default output or a new length constraint. For old list manifests missing this example, obtain it from the same key in the first item's components.

Default to string values. Only a text contract with maximum at least 40 permits rich text. Its shape is:

```json
{"paragraphs":[{"list":"none","runs":[{"text":"A supported conclusion","bold":true,"underline":false}]}]}
```

Use at most 8 paragraphs and 12 runs per paragraph. `list` is `none`, `bullet` or `number`; all run fields are required. Runs contain no newline or tab. Rich text is single-level, with limited bold and underline. Titles, labels and other short fields remain strings. Do not simulate formatting with Markdown or handwritten bullets. Paragraph boundaries count as one whitespace for length; automatic bullets and numbering do not count.

## Bind assets and native data

Image, icon and background values are local readable paths or `{"path":"/absolute/cache/asset.png"}`. Download or generate new assets only within the user's existing authorization. Keep provenance and licenses. Do not place remote URLs in DeckInput. Retain the original template's asset when appropriate and authorized; extract the actual related resource rather than inventing a path. PNG/JPEG fill uses centered cropping inside the original frame. SVG icons remain native SVG and target PowerPoint 2019+. Complex masks or effects still need native checks.

`@背景` is page-level only and has no suffix or range. Bind every background slot in a deck to the same local PNG/JPEG path. Preserve template colors by omitting `palette`; an explicitly authorized theme mapping can bind a valid palette deterministically. Do not recolor a source deck merely to make it look new.

Only whole page-level native tables and charts may be marked `@表格` or `@图表`. They take no range or suffix and cannot be list components. Their capacities come from the source OOXML. A screenshot is not a native data component.

Table values have `headers: string[]` and `rows: string[][]`. The source fixes column count, supplies the maximum data row count, and requires at least one data row. Merged cells are unsupported. Chart values have `categories: string[]` and `series: [{name: string, values: number[]}]`. Supported chart types are bar, line, doughnut and pie, with fixed series count and bounded category count from the Manifest. The template chart requires an internal editable XLSX workbook. Values must be finite numbers; pie/doughnut series must be nonnegative with at least one positive value. Label lengths, dimensions and supported features must pass the current validators.

Use only sourced data, with visible units and retained source references. Missing facts do not justify invented data. Reusing a chart page requires independent chart/workbook parts for each output instance; generated package checks and native editability checks remain separate.

Malformed names, missing locators, ambiguous list matching and unsupported components stop compilation. Report the source page, object key/name and error. Never silently drop the component or substitute a visually similar rebuilt page.
