# SlideLatch

中文优先，产品界面保留中英文。SlideLatch 是产品，PPT-DSL 是内部合同与确定性运行时。源 PPTX 的对象、几何、样式和资源是设计来源，禁止把重新绘制当作原版复用。

## 开发循环 A

- 非简单任务先用 pstack:poteto-mode 设计、实现、实测。若运行环境未加载 pstack，读取本地已安装 Skill；不可声称未执行的流程已完成。
- 先读 docs/team-workflow.md 和 docs/loop-a-backlog.md，再按 .codex/agents/ 的职责分派。
- 每个工作项一个 owner。每名写入者用独立 worktree、分支和 draft PR，不覆盖其他写入者或用户的未提交文件。
- 设计先说明输入、输出、不变量、失败状态和验收。修改行为时同步回归测试。
- 提交交付前运行 npm run verify。领域验收按 .agents/skills/verify-slidelatch/SKILL.md，不能以 CI 绿灯代替浏览器或 PowerPoint 原生检查。
- 非作者 verifier 验收精确 head SHA。新提交使旧结论失效；集成人员重新读取远程 SHA、CI 和验收。
- 当前不授权合并、auto-merge、生产部署、分支保护、凭据或权限调整、后台调度。需要这些操作时另行确认，不以沉默或绿色 CI 代替授权。
- 不为了通过检查删除关键测试、降低门槛或将失败改为跳过。重大合同、数据路径、成本、依赖和保真范围变更须人类决定。

## 产品与数据边界

- 循环 B 是真实 PPT 的导入、语义标记、边界探索、原生验收、编译与复用。本次先完成循环 A；不启动批量采集或自动处理 PPT。
- 只用已授权样本。不得把客户 PPT、个人文件、讲者备注、密钥或私有素材提交到公开仓库、CI 日志或新服务。
- 浏览器 SVG 是近似预览，OOXML 包检查是结构证据，PowerPoint 原生截图是独立视觉证据，三者不能相互替代。
- 原稿 SHA、工作区 snapshot、提案与审查记录保持绑定。更改标记或合同后，旧边界观察失效。不得伪造观察记录解锁 release。
- 无模型的规则识别不得称为 AI 语义理解。新增模型调用、付费服务、软件或大依赖须符合用户授权。
- 产品操作读 .agents/skills/slidelatch-workflow/SKILL.md；开发测试不自动运行 ai:codex，不接入常驻模型。
