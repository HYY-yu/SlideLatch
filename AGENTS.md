# SlideLatch

中文优先，产品界面保留中英文。SlideLatch 是产品，PPT-DSL 是内部合同与确定性运行时。源 PPTX 的对象、几何、样式和资源是设计来源，禁止把重新绘制当作原版复用。

## 开发循环 A

- 非简单任务先用 pstack:poteto-mode 设计、实现、实测。若运行环境未加载 pstack，读取本地已安装 Skill；不可声称未执行的流程已完成。
- 先读 docs/team-workflow.md 和 docs/loop-a-backlog.md，再按 .codex/agents/ 的职责分派。
- 每个工作项一个 owner。每名写入者用独立 worktree 和分支。新工作创建 draft PR，已有 PR 修复复用原 PR，不覆盖其他写入者或用户的未提交文件。
- 设计先说明输入、输出、不变量、失败状态和验收。修改行为时同步回归测试。
- 提交交付前运行 npm run verify。按变更范围提供真实浏览器、OOXML 包检查与原生 Microsoft PowerPoint 证据；不适用的检查说明原因。不能以 CI 绿灯代替浏览器或 PowerPoint 原生检查。
- 非作者 verifier 验收精确 head SHA。新提交使旧结论失效；集成人员重新读取远程 SHA、CI 和验收。
- 开发循环通过现有 loop 提示词、pstack 和 PR 推进，不依赖已删除的开发或验证 Skill。优先推进已有 PR；无可推进 PR 时，优先处理用户已确认且无人负责的产品 Issue。没有 Issue 不阻止从已授权计划选择小任务。coordinator 从已授权目标生成精确 scope，不要求用户逐项填路径。
- 以用户的 PR #23 为准，docs/team-workflow.md 与 .codex/agents/ 中对已删除开发或验证 Skill 的旧引用不再是执行前提；以本 AGENTS.md 和用户当前授权为准。不复制或恢复旧 Skill，不借用旧 capability。
- 用户允许通过独立验收的 PR 普通合并，正常 main 合并可以触发部署。每轮核实当前授权、head/base、CI 与未决审查，记录真实 merge SHA 和对应 production 结果。权限、凭据、分支保护、新服务或后台调度仍需相应授权，不能把绿灯当授权。
- 不为了通过检查删除关键测试、降低门槛或将失败改为跳过。重大合同、数据路径、成本、依赖和保真范围变更须人类决定。

## 产品与数据边界

- 循环 B 是真实 PPT 的导入、语义标记、边界探索、原生验收、编译与复用。本次先完成循环 A；不启动批量采集或自动处理 PPT。
- 只用已授权样本。不得把客户 PPT、个人文件、讲者备注、密钥或私有素材提交到公开仓库、CI 日志或新服务。
- 浏览器 SVG 是近似预览，OOXML 包检查是结构证据，PowerPoint 原生截图是独立视觉证据，三者不能相互替代。
- 原稿 SHA、工作区 snapshot、提案与审查记录保持绑定。更改标记或合同后，旧边界观察失效。不得伪造观察记录解锁 release。
- 无模型的规则识别不得称为 AI 语义理解。新增模型调用、付费服务、软件或大依赖须符合用户授权。
- PPT 产品操作适用时可读 .agents/skills/slidelatch-workflow/SKILL.md，它不是开发循环的前提；开发测试不自动运行 ai:codex，不接入常驻模型。
