# 循环 A writer 生命周期（Issue #11）

这是本地合作协议，不是操作系统沙箱、后台调度器或 GitHub 权限控制。执行入口为 `scripts/loop-a-lifecycle.mjs`，不修改 phase1 inspection 接口；两者竞争同一个 git common-dir 下的 `loop-a/lock`。本轮顺序明确改为 **本地非作者验收后才创建 Draft PR**，覆盖 team-workflow 中旧的先 Draft 后验收顺序。

## 数据与失败边界

租约保存 Issue、授权来源、owner、canonical 独立 worktree、branch、base/head、随机 epoch、CAS revision、批准写路径、真实 native actor ID、历史作者集合、20 分钟以内 deadline、修复预算和证据。coordinator 的能力与 worker 能力不同，只保存哈希。能力文件应放仓库外、权限 0600，不发到 PR、日志或聊天。不能将同一个全权能力交给 writer/reviewer。

原子 mkdir 取得共享租约；短事务 mkdir 序列化状态变更，临时文件 rename 提交状态。未知 schema、创建中锁、崩溃事务和缺失退出证据均失败关闭。没有 TTL 抢锁/删锁功能。磁盘或进程崩溃可能留下锁，需要人工调查，不能凭 PID、时间或 native completed/interrupt 状态恢复。

相同 epoch、operation_id、actor 和 payload 重放返回原结果；不同 payload 拒绝。新操作必须提供最新 expected_revision。时间超过 deadline 后拒绝新业务，不能自动释放。只有本协议记录的活跃 ChildProcess 可被前台 supervisor 发送进程组信号；不扫描或 pkill 用户进程。监督进程崩溃后 PENDING 不会被猜测为退出。

## 最小 CLI 契约

在目标独立 worktree 执行 Node 24。所有请求从本地 JSON 文件读取，能力不出现在命令行内容中。

- `node /冻结入口绝对路径/scripts/loop-a-lifecycle.mjs acquire input.json /私有目录/coordinator.json`
- `node /冻结入口绝对路径/scripts/loop-a-lifecycle.mjs inspect`
- `node /冻结入口绝对路径/scripts/loop-a-lifecycle.mjs ACTION request.json /私有目录/capability.json`

acquire 输入：`{"issue":11,"authorization":"授权来源的准确引用","owner":"协调者真实ID","paths":[".codex/agents/integration-manager.toml"]}`。可选 timeoutMs，最大及默认 1200000。返回 epoch/revision，私有输出文件额外包含 token。

每个后续 request 含 `operation_id`（唯一稳定字符串）、`expected_revision`（inspect 得到的整数）、`data`（下表）。capability 文件含 epoch/token；命令行 action 决定操作类型。不要把请求文件写入 pilot 工作区，否则会影响干净门禁。

| ACTION | data | 调用者及结果 |
| --- | --- | --- |
| dispatch-intent | role: writer 或 reviewer | coordinator；writer 仅 ACTIVE，reviewer 仅 SEALED；不得有活跃 actor |
| bind-actor | intent、id、capability、worktree | coordinator；从 inspect 取 intent，id 必须来自真实 native spawn 返回值，capability 为至少32字符随机私有值；reviewer 必须指定不同的干净独立 worktree，检出 sealed HEAD |
| write | path、content | writer；只允许批准的精确路径，拒绝 .git、父路径、符号链接 |
| managed-command | label: verify 或 commit | writer 或 SEALED reviewer（仅 verify）；固定 npm run verify 或批准路径的 git add/commit，不接收任意 shell、参数或环境 |
| confirm-quiescent | observations | coordinator；每项为 {id,status:"stop-acknowledged",noExternalProcesses:true,source,observedAt}，时间须晚于该 actor 最新业务；拒绝 completed/interrupt/unknown 代替停写确认；所有受管命令必须有内部监督器退出证据 |
| seal-writer | 空对象 | coordinator；QUIESCENT、干净工作区，记录精确 HEAD |
| record-review | head、passed:true、evidence | reviewer；真实身份不在历史作者集合；绑定精确 HEAD |
| record-pr | head、draft:true、url | coordinator；先独立审查，再记录真实 Draft PR |
| record-ci | head、mergeSha、run、passed:true | coordinator；分别记录 PR head 和 CI 测试的 merge SHA，不混为一谈 |
| request-stop | 空对象 | coordinator；停止新业务，运行中的 supervisor 轮询并停止其拥有的进程组 |
| repair | evidence | coordinator；所有 actor 停止后重新进入 ACTIVE，最多两次；相同证据第二次暂停 |
| release | 空对象 | coordinator；CI 或取消后的 QUIESCENT，所有 actor 与命令已停止、当前 HEAD 未变化；归档租约并释放共享锁 |

coordinator 把对应 worker 的 `{epoch,token: capability}` 写到独立私有能力文件，只交给该 worker。native spawn 未知时保留未绑定 intent 和锁，不再派第二名 writer。reviewer 完成后也必须收集停止确认；confirm-quiescent 在验收阶段保留该阶段，不破坏 CI 门禁。

## 实际 pilot

冻结后的实现入口来自本实现提交，pilot 不能改入口、测试或 package scripts。pilot 在另一个独立 worktree/branch，仅批准 `.codex/agents/integration-manager.toml`。按 acquire → dispatch/bind writer → write → managed commit → managed verify（新 HEAD） → actor 停写确认 → quiescent → seal → dispatch/bind 独立 reviewer → 精确 SHA 验收 → review → Draft PR → CI → reviewer 停止确认 → release 执行。coordinator 必须在发布/交付时再次查询远端 PR HEAD 与实际 CI；本地记录不是远端真实性证明。不得合并、部署或启动后台调度。

## 信任边界与验收

仓库 npm scripts、Git hooks 和工具本身是受信任代码，可能调用其他进程、网络或写生成文件；本协议没有禁用 hooks、绕过检查或提供 OS 级隔离。进程组检测无法证明恶意或自行 setsid 逃逸的子进程已停止；一旦知道有逃逸/外部未知操作，coordinator 必须拒绝 quiescence、保留锁并报告 BLOCKED_UNCERTAIN。native interrupt/completed/unknown session 不是进程退出证据。command-intent/start/exit 仅接受模块内部不可导出的 Symbol 授权，导出 API 与 CLI 均拒绝 worker 自报退出；监督器将实际 ChildProcess PID、启动时间、退出事件与进程组观察绑定。worker 不得直接修改本地状态文件；这是同用户权限下的合作约定，不是文件系统隔离。

源写先持久化 PENDING mutation（操作ID、路径、内容哈希），再写同目录独占临时文件并 rename 替换目标，最后记录完成。拒绝现有符号链接与硬链接。中途崩溃保留 PENDING，拒绝自动重放和释放，必须调查，不猜测副作用。release 原子归档后，旧租约的 release 重放从该 epoch 的归档读回，即使已有新租约也不能影响新 epoch。

测试使用临时 Git 仓库和真实子进程；产品 UI、PPT 导出及 PowerPoint 未变，不适用视觉/原生验收。完整验收仍要求 npm run verify 和非作者精确 SHA 审查。

命令定义在 acquire 时记录实际 Node/npm/Git 路径及固定环境，清除调用者 NODE_OPTIONS、GIT_CONFIG 等注入变量；不继承任意 PATH。保持正常 hooks 与 npm scripts。git add 与 commit 在同一受管进程组中执行。启动前通过私有 command-start 事务重查取消、deadline 与 reviewer HEAD；如果 leader 退出但组仍存活，记录 UNCERTAIN 并持锁，不对可能复用的 PID 发信号。

依赖由 coordinator 在派发前按两个现有 lockfile 预置或核验一致后复用，并记录证据。writer/reviewer 不自行绕过入口安装依赖。reviewer 的 capability 文件仍绑定同一 epoch，但从 coordinator 绑定的独立 review worktree 调用 managed-command/record-review；coordinator 的操作仍在 writer worktree。

record-review 门禁要求该 reviewer 最近一次受管 verify 为实际 EXITED/code 0，命令启动 HEAD 等于 sealed HEAD，全部命令已退出，且重新读取 reviewer checkout 仍为该 HEAD、工作区干净。失败、运行中或旧 SHA 的 verify 不能由 passed:true 声明覆盖。

writer 的 managed commit 允许合法推进 Git HEAD；租约 head 在 seal-writer 之前仍保留上次封存值。seal-writer 在全部命令退出、actor 停写、工作区干净后读取当前 HEAD，随后 reviewer 独立 checkout 精确新 SHA。pilot 使用 commit 后 verify 顺序，受管 verify 的 identity.head 记录新提交。任何 seal 后 HEAD 改变都会使验收失效。

## Cancellation recovery

New acquisitions use schema 2. The foreground supervisor records successful command results inside its exit transaction: epoch, actor, operation, capture time, HEAD, tree, parents and changed paths. These are Git observations by the supervisor, not worker declarations. Schema 1 remains readable but is never upgraded into mechanical commit evidence from a verify record.

The coordinator may `revoke-actor` only after complete, current stop evidence. The actor capability becomes null while identity, authorship and a revocation audit result remain. Old schema-1 helpers reject the revoked token before operation replay. Deadline expiry permits this cleanup but not new work.

`cancel-release` requires every historical actor bound, stopped and revoked; every command EXITED with groupGone; complete matching stop observations later than command exits; no pending mutation; and a clean stable repository within the allowed history and paths. Its binding names epoch, revision, canonical cwd/common directory, branch, base, original head, paths, observedHead, tree and parents. Supply a reason and exact recovery codeVersion. New schema uses `supervisor-evidence`. Legacy schema requires explicit `legacy-audited` mode plus an independent reviewer, authorization, source, observation time and identical binding. Human audit and external-process absence are attestations, not OS-enforced proofs.

Cancellation preserves the original lease head and records observedHead separately. Its only terminal state is CANCELLED_RELEASED, never successful RELEASED. The success helper rejects it. The transaction persists cancellation and its operation before renaming the entire lock to cancelled-EPOCH. Failed rename retains the lock. Identical authenticated retries finish archival before reporting success; archived retries address only that epoch and cannot modify a successor lease. Unknown transactions remain blocked rather than being removed automatically.

CLI `bind-worker` takes coordinator capability as its opaque third argument and a data.capabilityOutput path outside the repository. It generates the worker token internally, writes a new 0600 file and binds it without returning the token. Hand only that path to the worker. Neither coordinator nor worker should cat, open, read, echo, combine-read or forward capability contents. This cooperative contract is not an OS sandbox and does not revoke historical log copies by rotating values.
