# SlideLatch 开发团队协议

循环 A 负责软件开发。循环 B 负责实际 PPT 模板的处理与业务验收。先打通 A 的任务、实现、独立验收与 CI，再决定 B 的样本来源和覆盖要求。角色配置不是常驻 Agent，也不是定时器。

## 开始一个开发轮次

主协调读取最新 main、开放 Issue/PR、docs/loop-a-backlog.md 与当前验收。优先选择一个依赖满足、边界明确的小任务，不同时重写编辑器与运行时。

可在本仓库 Codex 对话使用以下指令：

```text
使用 pstack:poteto-mode，按 docs/team-workflow.md 协调 SlideLatch 循环 A。
读取 docs/loop-a-backlog.md，先选择一个依赖已满足的工作项。
用 template_contract、editor_workflow、native_fidelity、integration_manager 角色池。
每个写入者独立 worktree、分支和 draft PR，一任务一个 owner。
安排未参与实现的 verifier 对精确 head SHA 验收，保留失败与未运行项。
不启动循环 B，不合并、不部署、不改权限，不创建后台定时任务。
只报告有用结果、阻塞和需要人类决定的事项。
```

角色文件遵循 [Codex custom agents 格式](https://learn.chatgpt.com/docs/agent-configuration/subagents#custom-agents)。模型与权限继承当前会话。客户端是否已加载角色、实际并发和已启动任务必须现场确认。角色文件存在不证明四个 Agent 正在工作。

## 任务状态与交接

1. **待派发**。Issue 写清 owner、领域、依赖、允许路径、输入输出、不变量、失败行为、验收命令与风险。无 GitHub 访问时先用本地任务记录，标注尚无远程 Issue，不伪造编号。
2. **实现中**。owner 在独立 worktree 和分支先补能失败的回归验收，再实现最小改动。主目录、他人分支和用户未提交改动只读。只推自己的任务分支，不 force-push 共享分支。
3. **待独立验收**。owner 提交代码，给出完整 head SHA、diff、命令、结果和限制。先开 draft PR。verifier 不参与该变更的编写，使用独立干净 worktree 检出精确 SHA。
4. **验收通过或退回**。verifier 记录 SHA、身份、时间、输入样本的非敏感标识、环境、实际命令、结构/浏览器/原生各层结果、证据位置及未覆盖项。失败退给 owner；禁止由作者自行降低验收要求。
5. **待用户合并决定**。integration_manager 重新读远程 head，与验收 SHA 比较，检查当前 SHA 的 verify 和现有 required checks。全部成功也只代表满足已执行的检查，不构成合并授权。
6. **完成**。本次配置任务交付以配置已验证及真实 GitHub 状态为准。产品任务只有用户授权合并且实际合并后才更新 main 完成状态；合并后重跑依赖任务需要的验证。新 SHA 产生后重新验收。

验收记录放在 PR 评论或独立证据目录，记录目标代码 SHA，避免为了加入自身 SHA 再修改被验收提交。CI 的 PR merge 测试提交与 PR head 可能不同，必须同时记录 head 与 run 信息，不能拿旧绿色 run 证明新 head。

## 四类职责

| 角色 | 负责结果 | 必要证据 |
| --- | --- | --- |
| template_contract | 对象/页面合同、编译、候选选择、填充校验、确定性运行时与错误边界 | Schema/Manifest 不变量、负例、回归测试、输入输出 SHA 与包验证 |
| editor_workflow | 导入、工作区状态、对象选择、提案审查、边界探索与导出体验 | 实际浏览器流程、恢复/重复操作、旧 snapshot 拒绝、截图与控制台结果 |
| native_fidelity | OOXML 与原生保真验收，针对缺陷建立可复现样本和测试 | 输出包、原生 PowerPoint 打开结果、页/对象对比、字体和渲染环境及差异 |
| integration_manager | 任务队列、依赖、CI、SHA 绑定验收、PR 范围与人类决定 | 最新远程 SHA、CI run、非作者 verdict、风险和待决项 |

角色可按任务轮转，但一个任务的作者与 verifier 必须不同。native_fidelity 可以为其拥有的缺陷实现修复，该修复须交给另一名未参与编写的 verifier。integration_manager 不代替领域专家做深层验收。

## 验收矩阵

所有提交先运行 `npm run verify`，覆盖完整既有 check 与构建。细节见验证 Skill。

- **结构与合同**：合法/非法输入、页角色顺序、列表容量、图表/图片/表格约束、未知与过期对象、源文件哈希、发布失败原子性、禁止静默改变布局。
- **编辑器变化**：真实浏览器验证导入失败保留工作区、成功导入清理旧状态、重复操作、撤销/重做、提案失败恢复、边界观察失效、导出后重新导入。桌面与窄屏按受影响界面实测。
- **导出或视觉变化**：先做 OOXML 包验证，再用原生 Microsoft PowerPoint 检查是否弹修复提示及实际页图。对照源 PPT 的对象、位置、字体、图片、图表、表格和受影响页面。没有应用或可用样本时标记 blocked，不把 LibreOffice/SVG 结果改称 PowerPoint 结果。
- **纯 CI/团队配置**：核对工作流事件、只读权限、固定 Action SHA、两套锁文件安装、失败返回码和完整 verify。没有产品 UI 改动可将浏览器/原生产品验收标记为不适用并说明原因。

不能由有限样本宣称任意 PPT 都可处理。测试集中区分已支持、拒绝、待验证；未运行或失败不能记为通过。

## GitHub CI 与边界

工作流仅由 pull_request、main push 和 workflow_dispatch 触发。Node 24，分别按根目录与 packages/ppt-dsl 锁文件安装，再运行统一验证。workflow 只读仓库，不使用客户文件、模型账户、部署密钥，不调用 AI，不自动创建 Issue、合并或发布网站。

首次远程 CI 成功必须以 GitHub 实际 run 与目标 SHA 为证。只有本地通过时应写“本地通过，远端未运行”。网络、权限或依赖安装失败应保留原错误与完成范围，不修改安全设置求绿。

本协议的审查规则目前是团队约定，不等于 GitHub 分支保护。没有经用户明确授权并验证的平台规则，不声称 required checks、review approval 或禁止直接 push 已强制开启。不要写入自托管 runner 或新的凭据。

## 人类决定

以下变化保留 draft PR，列出选项、推荐、影响、当前 SHA 与未决项：源 PPT 设计的重绘替换、页面合同/发布协议不兼容变更、降低保真或测试门槛、新增外部数据路径、模型供应商或收费、引入大依赖、生产部署、仓库可见性/权限、分支保护和持续定时运行。

没有批准时继续不依赖该决定的工作。配置文件不会唤醒 Agent；目前无 cron、自动化或常驻调度服务。若后续需要持续循环，须先确认频率、范围、机器可用性和通知策略，再用实际工具配置与验证。
