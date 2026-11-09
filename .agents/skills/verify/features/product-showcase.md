# F01 产品介绍与生成案例

用户通过中英文首页了解原版复用流程，比较两份预生成案例，查看图片并下载完整 PPTX。

## Sub-features

- F01.1 中英文切换、流程导航和 FAQ。
- F01.2 增长/提效案例与文本、动态列表、图片、图表比较。
- F01.3 放大预览、关闭弹窗及案例下载。

## How to get to it (user POV)

打开 `/zh` 或 `/en`。首页 **看看生成效果 / See it in action** 进入 `#results`；案例切换位于「选择生成案例 / Choose a generated case」，类型切换位于「查看变化类型 / Choose a change type」。FAQ 位于 `#faq`。

## Driving it with CUA

Preconditions: 完成基线启动，使用新标签。只操作本地首页。

- 语言：点击导航语言链接，观察 URL `/zh` 与 `/en`、标题、案例文字及下载链接随之对应。分别保存快照，不将另一语言记为已覆盖。
- 案例：点击 **B 运营提效计划 / B Operational efficiency plan**，再点击 **图表 / Charts**。观察所选状态、生成结果说明及图片 alt 对应提效和图表。切回增长/文本后观察恢复。
- 放大：点击 **放大查看 · 运营提效计划 · 图表 / Enlarge preview · Operational efficiency plan · Charts**，观察可见 dialog 内大图。点击 **关闭 / Close**，观察 dialog 消失。
- 下载：先注册 download，再点击 `#results` 中的 PPTX 下载链接。读取实际文件、计算 SHA-256，与当前 locale 的 `public/demo/showcase[/en]/efficiency.pptx` 比较。此静态案例下载与 F08 新内容生成分别记录。
- FAQ：展开 **这个 Demo 会调用 AI 生成整份 PPT 吗？** 对应的当前语言问题，观察答案显示；再次点击观察收起。保存实际答案，不从标题猜测功能状态。

## Gotchas

- 原生 AX 可能将 aria-pressed 按钮显示为 checkbox。不要据此改写 DOM role。
- 图片是预生成案例，不是本次生成结果。缩略图可见不证明 PPTX 下载或原生保真。
- 首页文案会变化。找不到上面的文案时读取当前 DOM，用区域及实际控件名定位，并报告地图漂移。
