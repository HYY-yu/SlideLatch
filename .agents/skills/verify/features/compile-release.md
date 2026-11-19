# F06 编译和发布审查后的模板

用 CLI 编译待复用模板。草稿编译与正式 release 分开记证据。当前 Studio 提供已标记稿和审查包，不提供编译控件。

## CLI 配方

在仓库根执行，输出目录必须尚不存在。

- 草稿：`npm run template:compile -- --template public/demo/minimal-business/minimal-business-original.pptx --out "$SL_VERIFY_EVIDENCE/compiled"`。检查模板、Manifest、锁、输入与内容 Schema、lint 产物及源文件 SHA。草稿没有视觉批准。
- 正式 release：用 [F05](boundary-review.md) 导出的实际 ZIP，解压到 `$SL_VERIFY_EVIDENCE/review`。执行 `npm run template:release -- --template "$SL_VERIFY_EVIDENCE/review/marked.pptx" --review "$SL_VERIFY_EVIDENCE/review/workflow-review.json" --out "$SL_VERIFY_EVIDENCE/released"`。检查 `workflow-release.json`、源 SHA 和输出包。只有完整真实审查包可用于成功路径，缺条件时将该路径记为 `blocked`。
- 负例：保留完整输入副本。在证据目录使用不完整审查、SHA 错配或已存在的输出目录，检查非零退出、未发布和既有文件未覆盖。合成观察只用于验证拒绝。
