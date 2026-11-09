# F05 内容边界探索与审查

用户预览标记允许的最小和最大内容，在有限 SVG 测量后记录真实观察，导出与精确 PPTX 绑定的审查包。

## Sub-features

- F05.1 文本和列表的最小/最大案例预览。
- F05.2 当前页文本容量搜索、取消、报告与候选提案。
- F05.3 带依据的观察、修改后失效、审查包下载。

## How to get to it (user POV)

F02 后的「AI 辅助流程」区域，包含 **预览最小 / 最大边界 / Preview minimum / maximum boundaries** 和「自动测量当前页文本容量」。

## Driving it with CUA

Preconditions: 公开模板有有效文本及列表标记。找到当前页普通、未旋转、非列表文本；记录对象 key。预览仅代表 SVG。

- 边界：用 label 选择一个最小案例，观察页面和对象切换及压力文本。选择最大案例，观察变化。点击 **恢复实际内容 / Restore actual content** 后核对原正文。
- 观察：重新预览一个案例，未填依据时观察通过/失败按钮禁用。填写 **目视检查依据（必填） / Visual review reason (required)**，如实记录 **记录通过 / Record pass** 或 **记录失败 / Record fail**，观察记录计数更新。真实溢出必须记 fail。
- 失效：完成一条观察后按 F03 改标记，观察记录不再作为当前快照有效。不能把旧截图继续视为新合同证据。
- 测量：在 **文本对象 / Text node** 选择合适对象，设置 **搜索上限（1–128） / Search ceiling (1–128)** 为 8。点击 **开始实际渲染测量 / Start live-render measurement**。观察 24 个压力样本的进度、候选或 inconclusive 报告以及正文恢复。
- 取消：重新以较高上限开始，点击 **取消并恢复内容 / Cancel and restore content**，检查正文恢复且没有自动修改标记。完成测量后输入明确语义最小值，点 **用测量结果生成标记提案（不自动应用） / Prepare a measured-range proposal (no automatic application)**，观察只产生待应用 JSON。
- 审查包：注册 download，点击 **导出审查包（标记 PPTX + 审查 JSON） / Export review bundle (marked PPTX + review JSON)**。读取 ZIP 中 `marked.pptx`、`workflow-review.json`、`workspace-inspection.json`，核对审查 SHA 对应实际 PPTX。未检查或失败案例仍阻止 release。

## Gotchas

- 不能为解锁发布批量制造 pass。全量观察耗时并不允许跳过真实目视。
- 不可测量是 unknown/inconclusive，不是通过。搜索起点 1 不是语义最小值。
- 有限 SVG 样本不能证明字体、动画、图片、图表或 PowerPoint 最终布局。
