# F05 内容边界探索与审查

在 Studio 的真实 SVG 画布上观察当前快照的最小和最大案例，保留审查包及对应实际 PPTX。Agent 通过 `window.slidelatchWorkflow` 操作。宿主无法调用时标记该路径 `blocked`。

## 实测步骤

1. 按 [F02](import-browse.md) 加载含有效文本和列表标记的公开模板。执行 `inspect()`，从 `getReview().probes` 选取有记录价值的最小和最大案例，记录快照和案例 ID。
2. 执行 `previewProbe(id)`，等目标页和对象显示该案例。检查实际画布后调用 `recordObservation({probeId, snapshotId, verdict, reason})`。理由必须具体，溢出记 `fail`。检查缺理由和未显示案例的记录请求被拒绝。重新选择页面或对象后核对实际内容恢复。
3. 在打标前打开 **打标测量**。选中当前页文本框，运行测量并保存原文、宽中文、宽英文和混排边界。用英文公开样本第 8 页的长正文验证搜索可越过 128 字符。用自定义试填写入含 CJK 补充平面字符、英文和 emoji 的字符串。API 对应 `searchTextCapacity({key})`、`getCapacityReport(key)` 和 `measureText({key,text})`。取消后确认原文恢复。
4. 用公开样本第 30 页的五个原生组测列表。保留组件标记并清除五个组标记，载入衍生样本后打开 **重复对象候选**。试排 2 和 6 项并核对实际画布数量。选择试排文字对象复测组内文字。采用 2–6 项范围，导出并编译实际下载的 PPTX。检查 Manifest 的列表上下限以及生成 PPTX 的 Group 数量和位置。
5. 改一个真实标记后重新读取快照和 `getReview()`，确认旧快照的观察失效。
6. 注册下载事件后调用 `exportReviewBundle()`。从实际下载 ZIP 读出 `marked.pptx`、`workflow-review.json`、`workspace-inspection.json`。核对审查 SHA 对应实际标记稿。缺少观察或有失败案例时，按 [F06](compile-release.md) 验证 release 拒绝。

先实测再记录。有限 SVG 结果只能作为当前案例证据，PowerPoint 原生打开和页图单独核验。
