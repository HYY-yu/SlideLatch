# SlideLatch

**配置一次 PPT 模板，让 AI 按你的设计生成。**  
**Your PowerPoint design. Reused by AI.**

保留用户已有 PPT 的设计，辅助配置可修改对象与约束，形成可复用的模板合同。外部 AI 提供内容，确定性生成器负责校验并输出可编辑 PPTX。产品目标是让任意 AI 沿用用户的完整设计生成。

## 当前进度

已完成产品方向、需求草案、初步研究和基于 Cruip Open 的中英文 landing 与纯前端 PPTX 标记工作台首版。极简商务 33 页已支持标记与布局调整、PPTX 写回；新增两份真实生成报告的文本、动态列表、图片和原生图表对比，支持静态预览与完整 PPTX 下载。中文和英文分别提供 33 页模板、两份 10 页案例和对应下载，节点 ID 与 DSL 标记保持一致；用户试点待开展。

## 文档

| 文档 | 内容 |
| --- | --- |
| [待办](TODO.md) | 下一步行动与开发顺序 |
| [MVP 需求](docs/mvp-requirements.md) | 用户流程、功能范围、数据合同、技术复用与验收 |
| [决策记录](docs/decisions.md) | 已定方向与待定方案 |
| [用户验证](docs/validation-plan.md) | 招募、访谈、试点和评估指标 |
| [首轮社媒运营](docs/research/2026-11-02-social-launch-plan.md) | 四平台抽样、Reddit 目标人群、具体求助、账号与首周执行草案 |
| [职业社区近七天报告需求](docs/research/2026-11-02-reddit-professional-reporting.md) | 财务、咨询、营销等 11 个社区的近期流程证据、推广密度与筛选结论 |
| [竞品研究](docs/competitor-research.md) | 竞品能力、需求线索及来源 |
| [品牌与域名](docs/naming-and-domains.md) | 品牌文案、名称取舍与核查记录 |
| [支持与事件分析](docs/design/engagement-analytics.md) | 点赞、调查邀请、试用入口、PostHog 配置与 Tally Popup |
| [真实生成对比](docs/design/generated-showcase.md) | 两份预生成案例、重建脚本与文件验收 |
| [部署说明](docs/design/deployment.md) | Cloudflare Pages、生产域名与静态构建 |
| [PPTX 工作台](docs/design/pptx-workbench.md) | 纯前端解析、SVG、标记与布局写回 |
| [Web PPT 编辑引擎](docs/research/web-pptx-editors.md) | 候选库、原对象映射、许可与实验标准 |

## 技术基础

- [PPT-DSL Skill](/Users/feng/.codex/skills/ppt-node-dsl-generator/SKILL.md)：Node/TypeScript CLI，提供模板编译、Schema、输入校验、PPTX 生成与包检查。
- 线上 PPT 运行时：`/Volumes/GW/codes/goProject/github.com/HYY-yu/joyfulWords/pptx_dsl_runtime`。
- 待新增：页面预览、对象选择、可视化打标、版本管理、独立分发，以及短报告所需的页面策略。

当前包含 landing 页面与项目文档；生成器尚未引入。技术改动需同步维护需求、合同文档与相关测试。

## 本地预览

```sh
npm install
npm run dev
```

打开 `http://127.0.0.1:3000`，支持 `/zh` 与 `/en`。

页面文案、结构与样式入口见 [Landing 维护说明](docs/design/landing.md)，模板来源见 [第三方声明](THIRD_PARTY_NOTICES.md)。

## 事件分析与试用申请

PostHog 配置见 [.env.example](.env.example)，未配置时不发送数据，本地默认不上报。Tally 已接入公开表单 `7XqVaa`，点击申请后使用 Popup 填写，表单答案不传给 PostHog；事件合同与接入说明见 [支持与事件分析](docs/design/engagement-analytics.md)。
