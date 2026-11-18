# F08 填充、校验与生成 PPTX

用已标记模板和真实 DeckInput 生成可编辑成稿。记录内容校验、完整输入校验、实际产物与 OOXML 结果。

## CLI 配方

- 预置：按 [F04](proposal-handoff.md) 离线写入公开 fixture 后，用 `npm run template:compile -- --template "$SL_VERIFY_EVIDENCE/marked/marked.pptx" --out "$SL_VERIFY_EVIDENCE/semantic-compiled"` 编译。用 `tests/fixtures/growth-semantic-deck.json` 验证已有公开内容。该 fixture 不触发模型调用。
- 校验：用 `npm run deck:validate -- --manifest "$SL_VERIFY_EVIDENCE/semantic-compiled/template-manifest.json" --input tests/fixtures/growth-semantic-deck.json --content-only` 验证内容，再去掉 `--content-only` 做完整校验。另造一份超长字段的输入，检查报错能定位到字段。修复后复测。
- 生成：`npm run deck:generate -- --template "$SL_VERIFY_EVIDENCE/semantic-compiled/template.pptx" --manifest "$SL_VERIFY_EVIDENCE/semantic-compiled/template-manifest.json" --input tests/fixtures/growth-semantic-deck.json --out "$SL_VERIFY_EVIDENCE/generated.pptx"`。运行 `npm run deck:verify -- --pptx "$SL_VERIFY_EVIDENCE/generated.pptx"`，保存文件和 SHA，检查模板页序、字段变化和页数。公开 growth fixture 的预期输出为 9 页。
- 重复：用相同输入生成到另一个新路径。比较页序、对象和填充值，不要求 ZIP 字节相同。

纯文本 fixture 不证明资产和图表路径。需要原生视觉证据时，用 Microsoft PowerPoint 检查实际产物，分开记录修复提示及页图。
