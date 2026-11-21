# SlideLatch

中文优先，产品界面保留中英文。SlideLatch 是产品，PPT-DSL 是内部合同与确定性运行时。用源 PPTX 的真实对象、几何、样式和资源复用设计，禁止用重绘代替。

## 开发循环 A

- 非简单任务使用 `pstack:poteto-mode` 设计、实现和实测。运行环境未加载时读取本地已安装 Skill。
- 按[团队协议](docs/team-workflow.md)和[单轮提示词](docs/loop-a-once.md)推进已授权工作。协调者核实当前 PR 和队列，生成执行范围，按 `.codex/agents/` 的职责分派。每项工作一个 owner，写入者使用独立 worktree 和分支，保护他人及用户未提交的改动。新工作经独立复核后开 draft PR，已有 PR 修复复用原 PR。
- 设计说明输入、输出、不变量、失败行为和验收。行为变更补回归。交付前运行 `npm run verify`，由非作者复核精确 head SHA。新提交须重新验收。按变更范围提供真实浏览器、OOXML、原生 Microsoft PowerPoint 证据，注明不适用或阻塞项。三类证据和 CI 分别记录。
- 在用户现行授权内，可普通合并通过独立验收的 PR，正常 main 合并可触发部署。合并前核实授权、head/base、CI 和未决审查，合并后核对真实 merge SHA 和对应 production 结果。
- 保留关键测试和验收门槛，按实记录失败。重大合同、数据路径、成本、依赖、保真范围及仓库权限、凭据、分支保护、新服务、后台调度变更须按[团队协议](docs/team-workflow.md#人类决定)取得授权。只使用当前任务的 capability。

## PPT-DSL 上游维护

- 在规划任务和提交 PR 时明确改动归属。通用 DSL 语法、Manifest 与 Schema、模板编译、选页、填充校验、PPTX 生成与 OOXML 检查归 [ppt-dsl-generator](https://github.com/HYY-yu/ppt-dsl-generator)。
- 修改公共运行时时，先在上游提交代码和回归测试。上游合并后，再在 SlideLatch 更新 `packages/ppt-dsl` 的源码快照，并记录所用 Git commit SHA。跨仓库改动在 SlideLatch PR 中链接上游 PR 和所用提交。同步以 GitHub 为来源。
- SlideLatch 负责 Studio、语义打标、专用页面备注、人工验收和发布门禁。两个 Skill 独立维护。

## 产品与数据边界

- AI 在 Studio 中测量源稿的文字容量、识别和试排重复对象，再提交语义标记。用户在 Studio 验收与微调标记稿。[SlideLatch Skill](.agents/skills/slidelatch-workflow/SKILL.md) 负责引导 AI 操作工作台、编译和成稿。循环 B 按当轮明确授权执行。批量采集或自动处理 PPT 需单独授权。开发测试不自动运行 `ai:codex` 或接入常驻模型。
- 只用已授权样本。客户 PPT、个人文件、讲者备注、密钥及私有素材留在获准范围内，禁止写入公开仓库、CI 日志或新服务。新增模型调用、付费服务和软件须符合本轮授权。
- 保持原稿 SHA、工作区快照、提案与审查记录绑定。标记或合同变更使旧观察失效。release 的观察必须来自实测。规则候选只代表结构推断。
- 用 `components/modal-dialog.tsx` 渲染原生弹窗。仅在允许遮罩关闭的弹窗设置 `dismissOnBackdrop`。
