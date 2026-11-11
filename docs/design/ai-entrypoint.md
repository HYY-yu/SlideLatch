# SlideLatch AI 入口与原版复用

2026-11-07。定位是**忠于原版的快速复用**：保留原 PPT 的对象、几何、样式和资源，只在明确合同内替换内容。不是根据品牌风格重新设计页面。所有范围仍以明确支持的对象与经过验证的合同为准，不承诺任意 PPT 或全内容视觉一致。

## Skill 先打标，Studio 后验收

用户的主要入口是 SlideLatch Skill。AI 在当前已授权会话中完成准备、语义判断与打标，随后把真实 `marked.pptx` 加载到 Studio，再交给用户验收。Studio 保留画布、属性、问题与标记稿/验收包导出。用户确认后，由同一个 SlideLatch Skill 驱动 AI 编译当前已验收稿，再通过仓库内 PPT-DSL 选页、填充、校验和生成。成稿替换、内容 JSON 和创建操作均由 AI 处理，不进入用户工作台。

用户确认与 SVG 边界记录、原生 PowerPoint 证据、正式 release 门禁分别处理，不能相互冒充。

## 两种 AI 使用方式

### 已授权的 AI 对话 / 仓库 Skill

仓库提供 `.agents/skills/slidelatch-workflow/SKILL.md`。已有 AI 会话可以读取这个 Skill 以及离线请求，语义判断哪些对象可编辑、页面类型是什么，输出严格 JSON。Skill 是操作说明，不自带模型、凭据或后台服务，也不会自行调用付费 API。

```sh
npm run ai:prepare -- --template /absolute/path/input.pptx --out /absolute/path/new-handoff
```

该离线命令绑定原 PPTX 字节和快照，输出请求、Schema、提示词与原稿副本。它只读取 OOXML，未渲染页面，也不假造映射成功或视觉通过记录。任意讲者备注不进入此命令，只传入已有的结构化页面合同。Skill 通过 Studio 操作接口读取的数据则以当前渲染工作区为准。

AI 读取 `recognition-request.json` / `prompt.txt` 后，生成含 `marks` 和/或 `pages` 的提案并执行本地校验与应用：

```sh
npm run ai:apply -- --bundle /absolute/path/new-handoff \
  --proposal /absolute/path/proposal.json --out /absolute/path/new-marked
```

只允许写名称标记和专用页面合同，不能通过提案偷偷改正文、几何或任意备注。输出是 `needs_review` 的 `marked.pptx`，由 AI 加载到 Studio 并完成可执行的边界检查，再交用户验收。确认后如需正式发布，仍经过 release 门禁。输出目录必须是新目录，防止覆盖已有资料。

### 用户主动启动已有 Codex CLI

本机已实际检测到 ChatGPT 应用内置的 Codex CLI `0.167.0-alpha.3.2`，状态为 `Logged in using ChatGPT`。无需安装、保存新凭据或使用独立 API key。

```sh
# 只检查本地二进制、登录状态和待处理文件，不运行模型
npm run ai:codex -- --bundle /absolute/path/new-handoff \
  --out /absolute/path/proposal.json --dry-run

# 用户审阅 prompt.txt 并同意此文档与额度使用之后，主动执行
npm run ai:codex -- --bundle /absolute/path/new-handoff \
  --out /absolute/path/proposal.json --confirm-chatgpt-use
```

如果不在 PATH，可用 `--codex /absolute/path/to/existing/codex` 指向现有程序。命令本身也会查找本机已知的 ChatGPT 内置位置，不安装或登录。

**成本与数据边界：**第二条命令会通过现有 ChatGPT/Codex 账户把准备好的对象/文本清单发给 OpenAI，消耗其额度或 credits。不能承诺免费；本次未启动这条额外模型命令。若要由助手代执行，需要明确授权该文档与额度使用。与 API key 登录状态不符时直接停止，不切换到按量计费 API。命令清除常见 API key/替代端点环境变量、忽略用户模型提供商配置，在临时只读 ephemeral 会话中要求仅输出 JSON。它不提供独立沙箱保证或零留存承诺，最终仍严格验证输出，仅保存未应用的提案。模型返回无安全修改时保存空提案并报告 `no_safe_changes`，不会强行创造修改或应用。

`--dry-run` 成功不是模型调用成功。完整 Codex 进程的云端返回尚未在本次验证；网络、额度、模型 Schema 接受情况仍可能成为实际运行障碍。离线 prepare/apply 与已授权对话入口均已真实验证。

## 本次真实模型与端到端证据

输入仅为仓库公开的 `public/demo/showcase/growth.pptx`，10 页虚构演示，没有客户资料。

本次对话模型根据实际页文本、对象层次与几何做语义判断，提出 37 个标记和 10 个页面合同，包括固定三项目录、章节序号、标题/正文。品牌行、虚构声明、未确认的图表/装饰保留。输出不是 `recognizeStructure` 的规则候选，也没有额外启动 Codex CLI 或付费 API。边界范围只是模型候选，未做视觉认证。

模型随后填写一份关于原版复用的 9 页新内容。验证链真实执行：

1. 离线 prepare 绑定来源。
2. 同一严格提案验证器 apply 写入标记与页面合同，原正文和几何逐项保持。
3. 原运行时 draft compile 成功，保留 `needs_review`，没有伪造 release 记录。
4. 完整 DeckInput 校验通过，确定性填充章节/目录序号。
5. 同一输入实际生成两次 9 页 PPTX。
6. 两次包验证均通过，内容、对象身份和几何一致；不要求 ZIP 字节/GUID 一致。

可复现实例保存在 `tests/fixtures/growth-semantic-proposal.json` 与 `growth-semantic-deck.json`。`tests/ai-handoff.test.mjs` 自动重新走完这条链。该测试证明已有模型提案可通过完整管线，不代表测试时再次调用了模型，也不代表判断已经获得用户业务语义确认。

本机临时输出 `/tmp/slidelatch-ai-growth-20261107/generated.pptx` 是测试产物，不是经过目视签核的正式交付模板。

## 统一 Skill 与 Studio 的分工

`.agents/skills/slidelatch-workflow/SKILL.md` 是唯一产品 Skill 入口。其本地 references 内聚 PPT-DSL 的对象合同、大纲容量、模板选择、两阶段内容校验、资产绑定、精确修复、生成与检查流程，不要求另行安装或调用 PPT-DSL Skill。确定性运行时沿用 `packages/ppt-dsl`，没有复制另一套代码或新增模型服务。

Studio 仅供已标记稿验收与微调。`WorkflowController` 不渲染 AI 窗口，持续提供 `window.slidelatchWorkflow` 的检查、提案应用、实测与审查包导出能力。`exportReviewBundle()` 对实际写回文件计算 SHA 后打包。AI 必须编译用户最后确认的精确文件，不能继续使用用户编辑前的副本。

AI 在用户确认后调用 `template:release` 或明确标为草稿的 `template:compile`，再执行 `template:select`、`deck:validate --content-only`、完整 `deck:validate`、`deck:generate` 和 `deck:verify`。标记验收与内容大纲确认分别处理；已有获批大纲直接沿用。Studio 不提供成稿页选择、替换、JSON 填写或创建按钮。

具体支持边界、草稿与正式 release 区别见 `ai-template-workflow.md`。程序检查不代替 SVG 观察或原生 PowerPoint 验收；旧独立 PPT-DSL Skill 的程序验证默认值不覆盖本仓库门禁。
