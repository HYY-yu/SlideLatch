# SlideLatch FeatureMap

本地图是用户行为的验证索引。每个功能文件给出入口、操作配方、可观察结果及限制。源码依据不代表该入口已经实测；本次运行状态和证据保存在独立运行报告，不能从文件存在推断通过。

## Baseline preconditions

- 先按 [verify](../SKILL.md) 启动并 doctor 本次独立实例。
- 从新的 `/zh` 标签开始。英文在 `/en` 使用对应控件名，每种语言单独记录覆盖。
- 只用仓库公开模板及虚构案例，不引入客户或个人文件。
- 除了 CLI 的新输出目录，没有数据库或账号初始化。编辑器状态只存在当前页面，刷新会丢失。
- 完整审计覆盖下面全部入口，未触达的路径保留 `not_run` 或具体 `blocked`，不能用另一条路径代替。

## Driving conventions

浏览器配方中的 **控件名** 为中文，斜线后为英文名称。`getByRole` 或 `getByLabel` 必须以当前 DOM 为准。同名按钮限定 `#demo`、`#deck-studio` 或对应 dialog。不要硬编码 AX 索引、首个文本字段或 DOM 次序。

CLI 路径以当前 worktree 为基准。输出路径全部在本次证据目录，且必须尚不存在。每个命令保留退出码，失败立即记录，不能继续假装已生成。

## Proof and skip reporting

通过要求有动作及结果证据。下载必须有实际文件；生成须包验证；原生保真须 PowerPoint 独立证据。规则候选、AI 提案、SVG 观察与正式发布分别报告。不能批量伪造观察以解锁发布。

## Features

| ID | 用户功能 | 文件 | 入口 |
| --- | --- | --- | --- |
| F01 | 了解产品与查看案例 | [产品与案例](product-showcase.md) | `/zh`、`/en`、`#results`、FAQ、案例下载 |
| F02 | 打开并浏览 PPTX | [导入与浏览](import-browse.md) | 本地 PPTX、公开极简商务模板 |
| F03 | 配置并导出模板 | [编辑与导出](edit-export.md) | 画布、对象列表、属性、历史、导出对话框 |
| F04 | 准备和审查语义提案 | [提案交接](proposal-handoff.md) | AI 辅助流程、页面契约、离线 prepare/apply |
| F05 | 探索内容边界 | [边界审查](boundary-review.md) | 边界案例、容量测量、观察、审查包 |
| F06 | 编译和发布可复用模板 | [编译与发布](compile-release.md) | 浏览器工作区编译/文件导入/草稿 ZIP、CLI compile/release |
| F07 | 选页并组织成稿 | [页面组织](compose-deck.md) | 成稿工作台、骨架、选页/替换/排序、CLI select |
| F08 | 填充并生成 PPTX | [填充与生成](fill-generate.md) | 浏览器填充/校验/下载、CLI validate/generate/verify |
| F09 | 反馈和申请试用 | [反馈与试用](engagement.md) | 点赞、邀请、导航/案例/页尾试用、Tally 恢复 |

## Maintenance sources

核对产品入口时读 `components/landing.tsx`、`components/generated-showcase.tsx`、`components/template-demo.tsx`、`components/pptx/workflow-panel.tsx`、`components/pptx/deck-studio.tsx`、`components/engagement.tsx` 及根 `package.json`。范围说明见 `docs/design/ai-template-workflow.md`。README 的历史进度不替代当前入口。
