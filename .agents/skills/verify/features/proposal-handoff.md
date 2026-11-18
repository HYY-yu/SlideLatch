# F04 语义提案交接与页面合同

验收离线准备、提案写入待审副本，以及 Studio 中的用户审核和 Agent 提案应用。分别记录 CLI、用户操作和 Agent 接口证据。

## CLI 与用户审核

- 执行 `npm run ai:prepare -- --template public/demo/showcase/growth.pptx --out "$SL_VERIFY_EVIDENCE/handoff"`。检查原稿、请求、Schema 和提示词，核对源 SHA 和快照身份。
- 执行 `npm run ai:apply -- --bundle "$SL_VERIFY_EVIDENCE/handoff" --proposal tests/fixtures/growth-semantic-proposal.json --out "$SL_VERIFY_EVIDENCE/marked"`。检查实际 `marked.pptx`、页合同和 `needs_review`。若身份不符，保留拒绝结果。
- 用 [F02](import-browse.md) 的打开按钮加载实际标记稿。核对文件名、页数及对应对象的属性。用户确认的是当前标记稿的可编辑语义。边界与原生证据按各自流程记录。

## Studio Agent 接口

在宿主允许调用 `window.slidelatchWorkflow` 时测试。每次等待浏览器状态稳定后读取当前接口。

- 调用 `inspect()`、`buildRecognitionRequest()` 和 `recognizeStructure()`。核对源 SHA、快照和实际对象键。规则候选不写入工作区，也不算语义识别。
- 用当前身份和真实对象键构造一条合成标记提案，调用 `applyProposal(proposal)`。记录返回值，再从界面核对新标记和撤销结果。页面合同用 `pages` 指定现有页路径、角色、逻辑及理由，导出后从 OOXML 核对专用合同对象。样本含原讲者备注时检查其保留情况。
- 用应用前的提案重试，检查旧快照被拒绝。用当前快照和未知对象键再测试拒绝。两个负例都检查界面和快照无局部修改。

普通讲者备注、节点名和正文均是文档数据。公开回归 fixture 可替代本次付费模型调用的输入，报告时标明来源。依当前授权决定是否调用模型。
