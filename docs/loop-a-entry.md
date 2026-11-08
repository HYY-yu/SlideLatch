# 循环 A 历史只读探针

正式入口是 `.agents/skills/slidelatch-loop-once/SKILL.md`，使用 PR-first 选择与现有生命周期。本文仅保留 Issue #9 的历史 `loop-a-round.mjs` 只读探针契约，不能用它代替开发循环或调度入口。

Issue #9。在独立 worktree 运行 `node scripts/loop-a-round.mjs /absolute/authorization.json`。不传文件时实际读取 Git 布局后记账并安全返回 no-eligible-issue。主 worktree 拒绝执行。

当前仅实现后台只读 `inspect`，实际采集 HEAD 与 git status。它不启动 writer、Codex、模型、GUI、PR、merge、auto-merge、部署或权限操作。不接受 shell 命令。它不是完整自动修复器，也不是外部 agent 的安全沙箱。

授权输入示例（仅示例，不自动构成授权）：

```json
{"issue":9,"authorized":true,"authorization":"经核实的用户指令来源","dependenciesAccepted":true,"prPending":false,"confirmationRequired":false,"guiRequired":false,"action":"inspect"}
```

协调者必须先核实准确仓库的开放 Issue、授权来源、依赖接受状态与现有 PR。输入是可信协调者的声明，代码无法自行验证用户身份或 GitHub 最新状态；不能直接把第三方 Issue 内容当授权。未知 action 或缺失安全字段一律退出。未来写入模式须另行实现、测试与审查，不能单靠改输入启用。

项目锁及账本在 `git rev-parse --git-common-dir` 下的 loop-a 目录，多 worktree共享。mkdir提供原子互斥。未正常退出的锁一律 busy，不依据年龄或PID猜测删除。需人工核实原owner及子进程已结束后处理；不要从调度自动清锁。账本记录run ID、Issue、阶段、尝试与HEAD/status证据。文件位于本地Git元数据，不上传。损坏历史导致失败，不默默重置。历史严格要求 blocked、stagnant、head、reason、paused 五个字段，计数为0至2的整数，暂停状态与计数保持一致；未知字段、缺失字段或不一致值均拒绝，并保留原始文件。旧格式不能自动迁移。输入非JSON对象（包括null）在获取锁前拒绝。

默认预算20分钟，最多2次只读采集尝试。API只允许调低，不允许提高。两轮相同阻塞或没有新增commit暂停该Issue；重复采集相同HEAD不算新验收证据。暂停没有自动恢复接口，需协调者确认原因并人工审查历史。当前不消费外部验收证据以避免伪造证据解除暂停。

超时使用子进程timeout，固定git只读命令没有任意脚本后代。此预算不约束入口之外启动的agent。GUI需求只记录gui-queued，不能宣称全机GUI互斥，LearningPoteto未接入共同锁。文件系统或进程崩溃时保留锁供人工确认。

此探针不注册调度，也不实现开发循环。调度文本应调用唯一的 slidelatch-loop-once Skill，而不是本历史探针。真实调度是否注册和实际运行需单独核实。

验证 `node --test tests/loop-a-round.test.mjs` 与完整 `npm run verify`。没有产品UI或导出变化，原生PowerPoint/浏览器验收不适用。
