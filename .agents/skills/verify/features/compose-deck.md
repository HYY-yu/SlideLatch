# F07 选页并组织成稿

按已确认大纲从原模板选页。使用 [F06](compile-release.md) 的实际 Manifest 和 `template:select`。Studio 审核标记稿，成稿页序由 Skill 处理。

## CLI 配方

1. 读取实际 Manifest，选择内容页的真实列表 ID 和允许数量。写入候选请求，包含 `pageType`、`listCounts`、`availableAssetKinds`、`logic` 和 `usedTemplateIds`。未授权的资产种类不加入请求。
2. 执行 `npm run template:select -- --manifest "$SL_VERIFY_EVIDENCE/compiled/template-manifest.json" --request "$SL_VERIFY_EVIDENCE/candidate-request.json"`。检查 exit 0、实际候选的页型和容量。用相同输入重复运行，核对选页顺序一致。
3. 用超出所有候选容量的请求复测，检查输出 `[]` 和 exit 1。保存请求及候选输出供复跑。
4. 按已确认大纲组织页序，用实际模板 ID 填写与同一 Manifest 配套的 DeckInput。沿用 [F08](fill-generate.md) 的命令，用本次模板包和输入校验完整页序。用非法页序复测拒绝结果。F08 的 growth fixture 使用另一份模板包，独立复现即可。

仅在当前合同支持范围内验收，容量和逻辑以编译出的 Manifest 为准。
