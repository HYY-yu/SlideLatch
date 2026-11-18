# F05 内容边界探索与审查

在 Studio 的真实 SVG 画布上观察当前快照的最小和最大案例，保留审查包及对应实际 PPTX。Agent 通过 `window.slidelatchWorkflow` 操作。宿主无法调用时标记该路径 `blocked`。

## 实测步骤

1. 按 [F02](import-browse.md) 加载含有效文本和列表标记的公开模板。执行 `inspect()`，从 `getReview().probes` 选取有记录价值的最小和最大案例，记录快照和案例 ID。
2. 执行 `previewProbe(id)`，等目标页和对象显示该案例。检查实际画布后调用 `recordObservation({probeId, snapshotId, verdict, reason})`。理由必须具体，溢出记 `fail`。检查缺理由和未显示案例的记录请求被拒绝。重新选择页面或对象后核对实际内容恢复。
3. 对当前页普通、未旋转、非列表文本调用 `searchTextCapacity({key, upper: 8})`。读取 `getCapacityReport()`，保存候选或未得出结论的结果。重跑时可用 `cancelCapacitySearch()` 检查取消和恢复。仅在有当前有效候选和明确语义最小值时调用 `proposeMeasuredRange(min)`，检查它只返回候选提案。
4. 改一个真实标记后重新读取快照和 `getReview()`，确认旧快照的观察失效。
5. 注册下载事件后调用 `exportReviewBundle()`。从实际下载 ZIP 读出 `marked.pptx`、`workflow-review.json`、`workspace-inspection.json`。核对审查 SHA 对应实际标记稿。缺少观察或有失败案例时，按 [F06](compile-release.md) 验证 release 拒绝。

先实测再记录。有限 SVG 结果只能作为当前案例证据，PowerPoint 原生打开和页图单独核验。
