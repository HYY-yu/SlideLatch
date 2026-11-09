# F06 编译与审查后发布模板

用户将已标记 PPTX 编译为可复用草稿包，或将真正完成审查的模板通过发布门禁输出到新目录。

## Sub-features

- F06.1 编译当前工作区草稿、显式公开示例。
- F06.2 导入单个 PPTX、ZIP 或 template/manifest/lock 文件组。
- F06.3 导出编译草稿包、身份及篡改拒绝。
- F06.4 CLI compile 和正式 release。

## How to get to it (user POV)

`#deck-studio` 的 **编译当前工作区草稿 / Compile current workspace draft**、**导入 PPTX / 编译包 / Import PPTX / compiled bundle**、**试用公开示例 / Try public demo**。CLI 用 `template:compile` 和 `template:release`。

## Driving it with CUA and CLI

Preconditions: F02 已打开有完整页面合同的公开模板；F05 的真实审查包只在测试正式 release 时需要。CLI 输出均为新目录。

- 工作区：点击 **编译当前工作区草稿**，观察源文件名、模板页面数、SHA 和「草稿 · 未经过发布审查」状态。再改上方工作区，观察先前成稿源及校验失效。
- 公开示例：新标签点击 **试用公开示例**，观察加载成功，而不是静默替换失败的自有输入。
- 文件：通过文件选择器分别导入公开单 PPTX、后续导出的 ZIP、以及同次编译的 `template.pptx + template-manifest.json + template.lock.json`。每次观察身份一致与之前成稿被清理。可附同源 `workflow-review.json`；不匹配必须拒绝。
- 草稿 ZIP：点击 **导出编译草稿包 / Export compiled draft bundle**，等待 **下载模板 ZIP / Download template ZIP**，注册 download 并下载。读取文件清单和实际源 SHA，重导入验证。
- CLI compile：`npm run template:compile -- --template public/demo/minimal-business/minimal-business-original.pptx --out "$SL_VERIFY_EVIDENCE/compiled"`。检查模板、manifest、lock、Schema 及 lint 输出；无视觉审查背书。
- CLI release：对 F05 实际解压的包运行 `npm run template:release -- --template "$SL_VERIFY_EVIDENCE/review/marked.pptx" --review "$SL_VERIFY_EVIDENCE/review/workflow-review.json" --out "$SL_VERIFY_EVIDENCE/released"`。未完整审查应非零退出且不留下可用发布目录；真完成审查才检查 `workflow-release.json`。已有输出目录应拒绝覆盖。
- 篡改：只在证据目录副本改 manifest 或 PPTX，再导入/发布，观察精确身份拒绝。保留未篡改副本作对照。

## Gotchas

- 当前工作区可能缺页面合同，失败时应显示缺失，不应自动套示例。
- 没有真实完整审查包时，release 成功路径 blocked。合成 JSON 只能测试拒绝逻辑，不能作为发布证据。
- 草稿 ZIP、原始 DSL 编译与审查发布是不同结果。此功能不部署网站。
