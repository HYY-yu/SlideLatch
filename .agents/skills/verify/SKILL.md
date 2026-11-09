---
name: verify
description: 验证 SlideLatch 的真实浏览器工作台和 PPTX CLI 用户流程。用于功能验收、回归检查或按 FeatureMap 操作并保存证据；不调用模型，不把结构检查当作 PowerPoint 原生保真。
---

# Verify SlideLatch

先读 [FeatureMap](features/README.md)，按本次 scope 选择功能和入口。完整审计覆盖每个功能及其入口；生成本 Skill 时只需实证一条路径。未运行路径明确写 `not_run`，前置条件不满足写 `blocked`。

## Launch

在当前任务的独立 worktree 根目录运行。需要 Node 24、根目录及 `packages/ppt-dsl` 的锁定依赖。先用 `node --version` 和 `test -x node_modules/.bin/next` 检查。缺少依赖时报告，按当前安装授权处理。已有依赖可通过本地符号链接复用，记录链接来源，不能据此声称验证过干净安装。

没有数据库、迁移、账号或服务端种子。只使用仓库公开样本：

- 中文模板：`public/demo/minimal-business/minimal-business-original.pptx`。
- 英文模板：`public/demo/minimal-business/en/minimal-business-original.pptx`，以 `lib/demo/template.en.json` 的 `downloadUrl` 核对当前路径。
- 离线语义案例：`public/demo/showcase/growth.pptx`，配套 `tests/fixtures/growth-semantic-proposal.json` 和 `growth-semantic-deck.json`。

每次先建立独立证据目录，并记录基线：

```sh
export SL_VERIFY_EVIDENCE=$(mktemp -d /private/tmp/slidelatch-verify-evidence.XXXXXX)
git rev-parse HEAD > "$SL_VERIFY_EVIDENCE/head.txt"
git status --short > "$SL_VERIFY_EVIDENCE/worktree.txt"
node --version > "$SL_VERIFY_EVIDENCE/node.txt"
lsof -nP -iTCP:43127 -sTCP:LISTEN
```

最后一条应没有监听者。端口被占用时换一个空闲端口，并同步 URL，不能停止已有服务。证据目录位于 worktree 外，不能提交浏览器记录或用户文件。

用保留 session ID 的终端工具启动前台进程，保留其日志：

```sh
env SLIDELATCH_DIST_DIR=.next-slidelatch-qa NEXT_PUBLIC_POSTHOG_KEY= NEXT_PUBLIC_POSTHOG_HOST= ./node_modules/.bin/next dev --hostname 127.0.0.1 --port 43127
```

保存终端 session ID、命令、启动时间和 worktree 路径。不要后台化或在共享 checkout 同时运行构建。沙箱禁止 loopback 监听时，使用宿主正式权限流程，不能换公网地址规避。Next 使用自定义缓存目录会重写 `next-env.d.ts` 的路由类型引用，也可能在 `tsconfig.json` 的 include 中添加缓存路径。启动前保存这两个文件及已有差异，清理时只还原本次自动改动，不提交它们。

出现 `Ready` 后，用 `mcp__cua_repl` 创建专用 Chrome 标签打开 `http://127.0.0.1:43127/zh`。等真实界面出现，且「试用公开示例」已启用，才算可用。英文为 `/en`。使用新的专用标签隔离页面内存及 sessionStorage；不要接管用户已有标签。不同 worktree、缓存目录、端口和标签可并行，单个实例内串行操作。

## Doctor

在第一次操作之前，以及异常、失败或换实例之后运行以下只读检查，并保存输出：

```sh
git rev-parse HEAD
git status --short
lsof -nP -iTCP:43127 -sTCP:LISTEN
```

从监听结果读取 PID，再运行 `ps -p PID -o pid=,ppid=,lstart=,command=` 和 `lsof -a -p PID -d cwd`。将 PID 换为刚读到的数字。确认它是本次终端 session 启动的 Next 子进程，cwd 是本次 worktree，代码 SHA 和未提交范围与启动记录相符。父终端仍存活且没有启动错误。沙箱不允许读取进程信息时走宿主只读权限流程，不能省略身份检查。身份不符立即停止操作，不杀进程。

再用浏览器观察 URL、页面标题及 `选择模板，填充成稿 / Build a deck from your template` 标题，确认无构建错误覆盖层。HTTP 200 不能代替这一步。服务正常但页面卡住时，先保存证据，再关闭本次标签并新建标签回到已知状态。

## Drive

浏览器只用宿主提供的 `mcp__cua_repl`，按其首次返回文档操作。以下是该工具内的实际调用方式；不要把 UI 操作转到 shell、独立 Playwright 或内部状态 setter：

```javascript
var slTab = await cua.createBrowserTab('chrome', 'http://127.0.0.1:43127/zh', {sessionName:'🔎 SlideLatch verify'});
await slTab.getAXState();
await slTab.playwright.getByRole('button', {name:'试用公开示例', exact:true}).click();
await slTab.getAXState();
```

每次操作后获取新 AX/DOM 状态，再决定下一步。索引会变化，不能复用旧 AX 编号。优先使用地图中的 role、名称和 label；同名控件按区域限定。ARIA pressed 按钮在原生 AX 中可能显示为 checkbox，使用 DOM role locator 或最新 AX，不假设两者角色文本相同。

需要下载时，先注册 `slTab.playwright.waitForEvent('download', {timeoutMs:30000})`，再点链接，然后读取下载的 `path()`。验证实际落盘文件并复制到证据目录。超时先保存状态及 doctor，不能把链接出现当成下载完成。文件选择先读宿主的 `file-uploads` 文档，注册 chooser 后点按钮，再 `setFiles`。仅选择本地图列出的公开样本。

CLI 使用当前 worktree 中的现有 npm scripts。命令、stdout、stderr 和退出码一起保存。读取生成结果并计算 SHA-256。Node 中的 browser-deck 测试是引擎测试，不能代替真实浏览器入口。

## Evidence

每条记录包括 feature ID、入口、locale、代码 SHA、dirty 范围、浏览器实际版本、URL、动作、预期与实际结果、控制台错误、证据路径及限制。没有获得版本或日志时标 `not_captured`，不猜测。

- 在操作前后保存完整 AX/DOM 文本和截图；画面包含功能标题或文件身份。落盘 AX 使用 `slTab.getAXState({emit:false,disableDiffing:true})`，或保存 `slTab.playwright.domSnapshot()`。默认 AX 是增量，单独保存可能只有“无变化”，不能作为完整状态证据。通过宿主截图接口获取 bytes，再用 CUA runtime 的文件 API 保存到本次证据目录。记录实际点击或填写动作。
- 用 `slTab.dev.logs({levels:['warn','error'],limit:100})` 捕获日志；接口不可用时说明缺口。不要隐藏错误。
- 变更类操作再读取结果，例如保存文件、导出后重导入、撤销后字段值或修改后失效状态。不得调用 `window.slidelatchWorkflow` 或 `window.slidelatchDeck` 写入状态来充当用户路径。
- 生成 PPTX 后运行 `npm run deck:verify -- --pptx 证据目录中的实际文件`。它只证明 OOXML 结构。受影响的原生视觉检查须由 Microsoft PowerPoint 独立完成，记录版本、字体、修复提示和页图，不能用 SVG 或 LibreOffice 替代。
- 本地不配置 PostHog，不主动打开外部表单。验证 Tally 提交、真实模型调用或其他外部副作用前，按本次用户授权处理；缺授权就记录该入口未验证。没有网络观测时不宣称“零网络请求”。

## Cleanup

保存全部证据后关闭本次创建的标签。通过启动时保留的终端 session 发送 Ctrl-C，仅停止本次服务。确认该 session 退出，并检查 `lsof -nP -iTCP:43127 -sTCP:LISTEN` 没有监听者。若 session 丢失，先按 Doctor 重新确认 PID、cwd 和启动时间，再只终止确认归属的进程，禁止按名称批量 kill。

失败迭代也执行上述清理。证据目录不删除；列出目录文件，确认截图、状态、日志和报告仍存在。临时构建缓存可留在忽略目录；不要删除其他任务的文件。结束 CUA 工作后按宿主要求提交一次 completion summary。

## Helpers

本 Skill 不新增驱动程序或依赖。浏览器使用 CUA；CLI 调用根 `package.json` 中的 `template:compile`、`template:select`、`template:release`、`deck:validate`、`deck:generate`、`deck:verify`、`ai:prepare` 和 `ai:apply`。具体参数见各功能文件。

提交前运行 `npm run verify`。后续使用 `pstack:maintain-verification-skill` 维护地图，按 Codex 适配定位到本目录，不建立后台计划。
