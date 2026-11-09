# F08 填充、校验与生成 PPTX

用户在原设计允许的范围填写新内容，校验完整报告并下载可编辑 PPTX。完整 CLI 另支持合同内资产与数据填充。

## Sub-features

- F08.1 文字、原数量列表、自动编号与字符数。
- F08.2 完整稿校验、编辑后失效、取消和重复生成。
- F08.3 浏览器生成下载与最终包验证。
- F08.4 CLI validate/generate/verify。

## How to get to it (user POV)

F07 创建成稿后，在 `#deck-studio` 当前页字段填写，底部 **校验内容 / Validate content**、**生成 PPTX / Generate PPTX**、**下载生成的 PPTX / Download generated PPTX**。CLI 用根 npm scripts。

## Driving it with CUA and CLI

Preconditions: 公开示例创建合法完整骨架，未进行破坏顺序操作。下载能力可用。正例字段使用当前实际合同内的文字，不假设首字段含义。

- 正例：选成稿页，在对应 key 标签的 textarea 填入合同长度范围内文字，观察字符计数。点击 **校验内容**，观察通过及生成按钮启用；点击 **生成 PPTX**，等待「PPTX 已生成，结构检查通过 / PPTX generated; structural checks passed」。
- 下载：先注册 download，再点 **下载生成的 PPTX**，保存实际文件及 SHA。执行 `npm run deck:verify -- --pptx 实际下载文件绝对路径`，保存包结果。检查修改字段、页面数和选页顺序。原生 PowerPoint 检查另记，不从结构通过推导视觉通过。
- 失效：在生成后将最小长度大于 1 的字段改成单字符 `A`。观察旧下载消失、生成禁用；重新校验明确报告范围错误。恢复合法文字，再校验并连续生成两次，观察仅一个当前有效结果，不要求 ZIP 字节相同。
- 取消：启动生成后在处理期间点击 **取消 / Cancel**，观察回到可编辑状态，没有过期下载。太快而无法触达取消时报告 not_run，不伪造已覆盖。
- CLI：按 F04 离线 prepare/apply，再执行 `npm run template:compile -- --template "$SL_VERIFY_EVIDENCE/marked/marked.pptx" --out "$SL_VERIFY_EVIDENCE/semantic-compiled"`。用 `npm run deck:validate -- --manifest "$SL_VERIFY_EVIDENCE/semantic-compiled/template-manifest.json" --input tests/fixtures/growth-semantic-deck.json` 校验。
- CLI 生成：`npm run deck:generate -- --template "$SL_VERIFY_EVIDENCE/semantic-compiled/template.pptx" --manifest "$SL_VERIFY_EVIDENCE/semantic-compiled/template-manifest.json" --input tests/fixtures/growth-semantic-deck.json --out "$SL_VERIFY_EVIDENCE/generated.pptx"`，然后 `npm run deck:verify -- --pptx "$SL_VERIFY_EVIDENCE/generated.pptx"`。读取真实产物，预期 9 页。此 fixture 路径不代表本次调用模型。

## Gotchas

- 浏览器保留图片、图标、背景和列表数量。混合样式等不支持的编辑须拒绝，不能降级丢样式。
- CLI 图片、图表、表格等扩展路径需要相应授权资产和输入；上述纯文本 fixture 不覆盖这些能力，必须另记未验证。
- `runtimePackageValidation: passed` 与 Office native `not_run` 可以同时成立。
