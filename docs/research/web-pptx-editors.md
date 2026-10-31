# Web PPTX 编辑引擎调研

日期：2026-10-31。依据官方文档、仓库及现有模板合同；尚未导入模板实测、安装引擎或采购授权。Landing 代码未变。

## 当前方案

2026-10-31 后续已决定采用 pptxtojson + 自建 SVG + 原 OOXML 补丁写回，保持纯前端。编辑范围只包含标签、位置和尺寸，正文与样式只读。实现与验收见 [PPTX 工作台](../design/pptx-workbench.md)。以下候选比较保留为选型依据。

## 目标与判断

工作台采用左侧逐页缩略图、右侧可编辑页面；选中原对象后配置 SlideLatch 标记。需覆盖文本、图片、序号、固定/变长列表、表格、图表，保留对象定位和固定设计。

初查曾建议先用 PPTist 做纯前端编辑体验与导入能力实验；ONLYOFFICE 作为完整 Office 引擎路线评估。Univer Slides 是 SDK 路线备选，Slim Office 保留为进一步核验对象。选型取决于实际模板保真、DSL 映射和许可，不按宣传中的兼容率决定。

当前“不增加真实后端”的约束下，ONLYOFFICE 的标准部署和 Univer 的 PPTX 转换流程都不适合直接加入 landing。

## 候选对比

| 方案 | 可编辑能力 | 部署与接入 | 授权 | 对 SlideLatch 的判断 |
| --- | --- | --- | --- | --- |
| PPTist | 完整网页幻灯片应用，含文本、图片、形状、表格、图表、组合、撤销/重做、对象命名 | Vue 3/TypeScript 完整源码；浏览器解析 PPTX，需改造成独立工作台或集成子应用 | 当前 AGPL-3.0；作者提供独立商业授权联系路径 | 首轮纯前端实验候选；导入/导出会转换对象模型，原对象身份与保真须实测 |
| ONLYOFFICE Docs | 原生在线演示文稿编辑器，提供形状、图片、Group、表格、图表相关 API | 标准架构含 Document Server；宿主提供文件 URL、存储与保存回调 | Community 为 AGPLv3；Developer 为商业版 | 完整 Office 路线；对象 API 值得验证，部署和品牌化集成更重 |
| Univer Slides | SDK 提供画布、缩略图、选择、文本/形状/图片/组合及可选表格、图表插件 | 有 React/Next.js 集成；PPTX 导入/导出需要转换后端，包括导入本地 snapshot 的 API | Slides 使用 @univerjs-pro，需按功能配置许可；不能套用核心仓库的开源许可 | 可定制 SDK 路线；不符合现阶段零转换后端要求 |
| Slim Office / SlimPPT | 文档提供 parsePptx、mountEditor、writePptx，浏览器编辑和渲染 | 独立 parser/editor/serializer 包；编辑器还引入 OCR、OpenCV、公式渲染 | AGPL-3.0-or-later；文档要求闭源嵌入使用商业许可 | 接口形态合适，但需核实实际编辑覆盖、包体、稳定性和原对象映射 |
| pptxtojson + 自建编辑层 | 浏览器解析 PPTX 为 JSON；编辑、选区和规则 UI 自行实现 | parser 可独立复用；原始 OOXML 与 Manifest 保留为权威来源 | parser 为 MIT | 可控性高，编辑层工作量大；不能把 parser 当现成编辑器 |

### PPTist

官方明确提供左侧页面与编辑画布相关能力，支持元素命名、组合、文本、图片、表格、图表及文件导入导出。其定位是网页演示文稿编辑应用，完整 PowerPoint 兼容需要取舍。README 的保真百分比属于作者自述，本轮未验证，也不能换算为我们模板的通过率。

当前 README 已描述本地 PPTX 导入；旧 Q&A 仍称导入没有合适方案，存在资料时差，本调研优先当前 README。导入器和编辑器须分别核对许可：pptxtojson 为 MIT，PPTist 为 AGPL-3.0。

来源：[PPTist 当前 README](https://github.com/pipipi-pikachu/PPTist)、[旧 Q&A](https://github.com/pipipi-pikachu/PPTist/blob/master/doc/Q%26A.md)、[pptxtojson](https://github.com/pipipi-pikachu/pptxtojson)。

### ONLYOFFICE

官方架构包括编辑、转换等服务；不能把引入 api.js 理解为纯前端引擎。Presentation API 可以取得选择中的形状，读取/设置形状名、获取内部 ID，具备接入标记层的入口。官方没有在这些页面承诺内部 ID 等同原文件的 cNvPr/@id，或在导出重开后稳定。

另一个具体风险：SetName 文档写明，如果另一个对象已有同名，会将那个对象重命名为默认名称。极简商务封面就有两个 `@文本[2-8]`；直接用名称当唯一 key 或直接调用 SetName 写 DSL，可能破坏其他标记。需测试导入行为、Group 内作用域及保存结果，再决定是否采用独立 metadata + 编译时写回。

来源：[架构](https://api.onlyoffice.com/docs/docs-api/get-started/how-it-works)、[选择对象](https://api.onlyoffice.com/docs/office-api/usage-api/presentation-api/ApiSelection/Methods/GetShapes)、[SetName](https://api.onlyoffice.com/docs/office-api/usage-api/presentation-api/ApiShape/Methods/SetName)、[GetInternalId](https://api.onlyoffice.com/docs/office-api/usage-api/presentation-api/ApiShape/Methods/GetInternalId)、[版本与许可](https://www.onlyoffice.com/compare-editions)。

### Univer Slides

官方数据模型包含页面/元素、母版/版式与自定义数据；Facade/Command API 便于应用层扩展。图片支持裁剪，Group 暴露子对象与变换。此处只能证明 API 表达能力，不能证明 PPTX 转换后原 shapeId、DSL 名称和未支持内容无损。

导入导出文档明确要求转换后端，`importSlideToSnapshotAsync` 也不例外。可将预先转换的数据用于前端实验，但这与浏览器直接打开任意 PPTX 是两种能力。

来源：[Slides 概览](https://docs.univer.ai/guides/slides)、[导入导出](https://docs.univer.ai/zh-CN/guides/slides/features/import-export)、[数据模型](https://docs.univer.ai/guides/slides/model/slide-data)、[图片与组合](https://docs.univer.ai/guides/slides/features/core/images-and-groups)、[许可/产品范围](https://www.univer.ai/pricing/)。

### Slim Office

官方公开了 parser、renderer、editor、serializer 分层与 TypeScript 接口，支持浏览器读取和输出 PPTX。其仓库与文档宣称的能力尚未用极简商务验证；成熟度、中文字体、对象 ID、DSL 名称保留以及依赖体积均未定。

来源：[官方开源说明](https://docs.slimppt.cn/guide/open-source)、[仓库](https://github.com/sliiu/slimoffice)。

## 暂不作为完整编辑器候选

- PPTXjs：定位为 PPTX→HTML 转换插件，不能据此获得完整编辑和 PPTX 往返能力。[仓库](https://github.com/meshesha/PPTXjs)
- Syncfusion JavaScript PowerPoint Library：官方明确是 non-UI 文档处理库；Web PPTX Editor 另见 roadmap，需区分可用库与规划功能。[库说明](https://www.syncfusion.com/document-sdk/javascript-powerpoint-library)、[路线图](https://www.syncfusion.com/products/roadmap/pptx-editor-sdk)
- Polotno：已提供可编辑 PPTX 导出；本轮导入文档不足以证明原 PPTX 对象导入链路，暂不作为模板往返方案。[导入导出](https://polotno.com/docs/import-and-export)
- Nutrient：官方 Office 页面说明查看/转换，不据此认定具备 PowerPoint 原对象编辑。[说明](https://www.nutrient.io/guides/web/office)

## 标记层与引擎的职责

引擎负责渲染、选中、文本/图片/几何编辑、组合与撤销。SlideLatch 负责字段语义、长度、列表范围与 Item 映射、固定区域、序号策略、图表/表格数据合同、校验及 DSL 编译。这些业务规则不是换一个编辑库就自动具备。

建议维护独立映射：`templateVersion + slidePath + shapeId + groupPath ↔ editorElementId`。名称只承载 DSL，不作唯一身份。编辑后重新编译/核对映射；具体持久化方式待实验确认。

## 极简商务验收样本

本地读取 v4 Manifest：33 页，247 个文本组件、4 个图片组件、24 个序号组件、3 个图表、1 个表格；列表共 3 个动态、14 个固定。组件数包含列表 Item 内组件。这是测试输入盘点，不是任何编辑引擎的验收结果。

1. 全部 33 页生成独立缩略图；切页后对象选择、修改和撤销正确。
2. 选取第 1 页文本/图片、第 3 页动态目录、第 22–24 页图表、第 25 页表格、第 26–28 页图片布局，验证元素可编辑与层级完整。
3. 检查重名 DSL、shapeId、Group 边界、子组件、notes 及源页关系的映射。更改一个标记不能影响同名对象。
4. 修改中英文文字、图片、列表 Item 与原生数据；画布和缩略图同步。标记面板能覆盖每种合同，而非只改正文。
5. 导出后在 PowerPoint 中检查可编辑、无修复提示，固定区域保持；重编译合同并运行现有结构 gate。
6. 记录逐页视觉差异、标记保留率、导入耗时、首次加载资源体积与错误。不能用一个封面或整页截图代表全部通过。

首轮仅做隔离实验，不接入 landing 主依赖。分别评估“编辑器导出整份 PPTX”和“原包保留，仅回写受控节点”两条路径；若转换器无法保留结构，不把反复重建对象当成原模板保真已解决。
