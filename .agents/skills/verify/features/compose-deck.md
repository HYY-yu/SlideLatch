# F07 选择页面与组织成稿

用户从原模板选择页面，建立完整报告骨架，再替换、增删或调整顺序。

## Sub-features

- F07.1 公开示例与完整骨架。
- F07.2 页面类型筛选、添加、替换、移动、移除。
- F07.3 CLI 容量、资产与逻辑约束候选选择。

## How to get to it (user POV)

`/zh#deck-studio` 或 `/en#deck-studio` 的 **选择模板，填充成稿 / Build a deck from your template**。通过 F06 的任一输入取得模板。命令行另有 `template:select`。

## Driving it with CUA and CLI

Preconditions: 新标签，完成 doctor。公开示例不需要先加载上方编辑器。完整浏览器主配方如下，逐步保存动作和状态。

- 载入：点击 **试用公开示例 / Try public demo**，等待源文件名、33 个模板页面和 SHA 出现。记录「草稿」状态及选择器可用。
- 骨架：点击 **创建可复用成稿骨架 / Create reusable starter deck**。观察成稿页面列表出现，包含封面、目录、章节过渡和内容及结尾。当前公开示例预期 13 页；若变化，核对当前目录合同后报告漂移，不把任意页数当成功。
- 排序：点击 **下移第 1 / Move down slide 1**，观察前两页模板 ID 的顺序交换；点击 **上移第 2 / Move up slide 2**，观察原顺序恢复。保存前后列表。
- 筛选：按 **页面类型 / Page type** 选「内容页」，观察 **模板页面 / Template page** 候选属于该类型。选择实际模板 ID 后点 **加入成稿 / Add to deck**，观察新页加入。
- 替换：在成稿列表选中刚加入的页，在合同允许的标题字段填写可识别文字，例如 slide_007 的页级 text_1 填「验收临时标题」，保存状态。换一个内容模板并点 **替换当前成稿页（重置该页内容） / Replace current page (reset its content)**。观察模板 ID 及字段切换，临时文字消失，字段恢复新模板样本。
- 删除：点击刚加入页对应的 **移除第 N / Remove slide N**。N 使用当前列表实际页号。观察列表回到原序列。删除与排序后的输入可能违反完整报告合同，F08 必须拒绝非法序列。
- CLI：先按 F06 编译；将 `{"pageType":"内容页","listCounts":{"list_1":3},"availableAssetKinds":[],"logic":[],"usedTemplateIds":[]}` 保存为 `$SL_VERIFY_EVIDENCE/candidate-request.json`。执行 `npm run template:select -- --manifest "$SL_VERIFY_EVIDENCE/compiled/template-manifest.json" --request "$SL_VERIFY_EVIDENCE/candidate-request.json"`。有候选时观察数组和 exit 0；无候选时当前 CLI 输出 `[]` 且 exit 1，不提供逐项淘汰原因。用当前 manifest 核对 list ID 和容量，不能假设每页都有 list_1。

## Gotchas

- 不支持单页自由稿，完整稿要求 3–6 个章节且目录数量一致。
- 浏览器手动选页与 CLI 硬约束排序是不同入口，互相不能替代验收。
- 上方修改工作区会使从该工作区编译的源失效；显式公开示例源与工作区源分别记录。
