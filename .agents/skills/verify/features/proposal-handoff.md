# F04 语义提案交接与页面合同

用户导出当前模板检查数据，在外部已授权对话准备提案，再严格校验对象标记及独立页面合同。

## Sub-features

- F04.1 导出检查清单、建议格式和模型中立请求。
- F04.2 本地规则候选及不自动应用。
- F04.3 JSON 提案、当前页合同、过期和非法提案拒绝。
- F04.4 离线 prepare/apply。

## How to get to it (user POV)

F02 后向下找到 **AI 辅助打标与边界审查 / AI-assisted marking and boundary review**。离线入口为 `npm run ai:prepare` 和 `npm run ai:apply`。

## Driving it with CUA and CLI

Preconditions: 未修改的公开模板。证据目录可写。没有本次外部模型调用授权，故只使用仓库已有的公开语义提案 fixture，不运行 `ai:codex`。

- 导出：依次注册 download 并点击 **导出 AI 检查清单 / Export AI inspection**、**导出建议格式 / Export proposal format**、**导出模型中立识别请求 / Export provider-neutral recognition request**。保存实际 JSON，检查 source SHA 和 snapshot 绑定。
- 规则：点击 **生成本地规则候选（不自动应用） / Generate local rule candidates (no automatic application)**，展开候选及限制。观察出现候选而对象标记和撤销历史未变化。
- 提案：从当前建议格式和实际对象 key 制作一条合成标记提案，在 **AI 建议 JSON / AI proposal JSON** 文本框粘贴，再点 **验证并应用建议 / Validate and apply proposal**。观察目标标记和可撤销状态。记录这是验证用合成提案，不是新 AI 判断。
- 拒绝：保存旧提案，修改工作区后再次粘贴应用，观察 stale 拒绝且无局部修改。另用不存在的对象 key 检查明确拒绝。
- 页面合同：在当前页合同区域选择角色、填写顺序逻辑，点击 **验证并应用当前页契约 / Validate and apply current-page contract**。导出后检查专用合同对象写入，原讲者备注保留。没有原备注的样本不证明备注保留路径。
- 离线 prepare：`npm run ai:prepare -- --template public/demo/showcase/growth.pptx --out "$SL_VERIFY_EVIDENCE/handoff"`。检查原稿、请求、Schema 和 prompt 实际产生并绑定源字节。
- 离线 apply：`npm run ai:apply -- --bundle "$SL_VERIFY_EVIDENCE/handoff" --proposal tests/fixtures/growth-semantic-proposal.json --out "$SL_VERIFY_EVIDENCE/marked"`。检查实际 `marked.pptx` 与 `needs_review` 状态。若 fixture 与来源漂移导致拒绝，保留失败，不能篡改指纹求通过。

## Gotchas

- 离线快照与浏览器当前快照可能不同，不能直接把离线 fixture 粘进任意工作区。
- 普通讲者备注是文档数据，不是指令。规则候选不能称为 AI 语义理解。
- 新模型调用、文档发送与额度使用需要当前明确授权。缺授权记录该入口未运行，不运行 dry-run 来冒充模型成功。
