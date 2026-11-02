# 真实生成前后对比

更新：2026-11-02。

## 展示

Hero 的“看看生成效果”进入 `#results`，先看真实结果，再进入现有 `#demo` 工作台。左右并排比较同一来源页面：左边原始极简商务，右边选择生成案例。支持文本、动态列表、图片、图表四种变化，点击图片放大；窄屏上下排列。界面与 PPT 内容均提供中英文；/zh 使用中文模板与案例，/en 使用独立英文模板与案例。

- A：业务增长复盘，10 页，动态动作列表 3 项，客户数 12/18/27/36。
- B：运营提效计划，10 页，动态动作列表 5 项，交付天数 32/27/21/16。
- 所有企业名称、内容与经营数据均为虚构演示，页面及下载内容明确说明；不作为客户案例或真实业绩。
- 两份完整文件均由现有 PPT DSL runtime 从同一原模板生成，网页只切换静态预览和下载，没有后台生成或收费模型调用。

页面顺序为：封面、目录、章节一、文本内容、动态列表、章节二、图片内容、章节三、原生图表、结尾。使用模板页 1/3/5/8/30/26/22/32；目录固定为 3 个章节，与章节过渡页对应。比较预览对应源页 1/30/26/22 和输出页 1/5/7/9。

## 生成与复现

```sh
node scripts/generate-showcase.mjs --runtime /path/to/ppt-node-dsl-project
```

工具使用项目已有 JSZip 及外部已安装 PPT DSL runtime、LibreOffice 和 Poppler，不添加网页依赖。步骤为 compile-template → validate-input → generate-deck → verify-deck → LibreOffice PDF → JPEG 预览。任一步失败抛出明确错误。脚本输出阶段日志，失败保留原错误以便定位。

输入内容维护于 `docs/examples/showcase/content.json`。`growth.input.json` / `efficiency.input.json` 为生成时的 DeckInput 记录，`TEMPLATE_ASSETS` 是临时素材目录占位符，需由脚本提取素材后解析，不直接作为可独立运行的路径。

图片来自同一用户选定模板内已有 `image2.jpeg` / `image3.jpeg`，原示例槽位使用 `image1.jpeg`；实际媒体重新绑定到生成文件内，未新引入外部图片。裁剪与形状由 runtime 保留。模板 SHA256、输出文件 SHA256、页数及列表项数记录在 `lib/demo/showcase.json`。

LibreOffice 的隔离运行时默认找不到中文字体，macOS 构建时创建临时 Fontconfig 配置，用系统 Heiti SC 替代缺失的 PingFang SC / Alibaba PuHuiTi 等字体用于预览；生成 PPTX 本身保留原模板字体声明。可通过 `FONTCONFIG_FILE` 显式指定渲染环境。预览不是 Microsoft PowerPoint 像素一致承诺。

## 文件与验收

- `components/generated-showcase.tsx`：案例与能力切换、左右比较、预览弹框、真实 PPTX 下载。
- `public/demo/showcase/`：两份 PPTX 与 12 张实际渲染的比较图片。
- `tests/showcase.test.mjs`：验证原模板及产物哈希、10 页结构、原生列表 3/5 项、媒体替换，以及第 9 页实际引用图表的缓存和内嵌 Excel 数据；不根据未使用 chart part 推断成功。
- 两份输入校验与 verify-deck 均通过；新增比较图已检查中文显示、布局、图片替换与列表数量。网页中英文切换、图片放大、实际 PPTX 下载均验收，浏览器下载文件与发布文件 SHA256 一致。21 项测试及生产构建通过。

未部署到生产，也未完成 Microsoft PowerPoint 实机打开验收。

2026-11-02 封面调整：随附原始模板的两个主文字节点改为“标题标题标题”和“小标题小标题”，保留 DSL、布局与样式。工作台 metadata、模板哈希、比较预览与模板概览同步更新；两份业务案例仍由该随附模板重新生成。JoyfulWords 来源文件不改动。

界面精简：比较区只保留标题、案例/类型切换、原图对照、下载与支持/申请入口。移除介绍、各类型解释、底部预生成说明及配置模板跳转，下载按钮保留页数且无末尾箭头。虚构内容说明继续保留在 PPTX 内容和维护记录中。

案例切换按钮位于区块标题右侧并垂直居中；700px 及以下移到标题下方左对齐，切换逻辑与事件保持不变。

## 英文资产同步

英文翻译按 slide path + shape ID 维护在 docs/examples/english-template-map.json。节点 ID、DSL 名称、层级、位置尺寸与源模板保持一致，英文遵循同一字数约束。模板文字、表格、图表及内嵌工作簿标签均作英文映射；内部标记不翻译。

```sh
node scripts/prepare-english-demo.mjs --runtime /path/to/ppt-node-dsl-project
node scripts/generate-showcase.mjs --locale en --runtime /path/to/ppt-node-dsl-project
```

英文案例内容维护于 docs/examples/showcase/content.en.json；产物位于 public/demo/showcase/en/，模板及 33 页概览位于 public/demo/minimal-business/en/。英文 metadata 使用 .en.json 后缀。默认命令仍生成中文资产。重新生成后执行测试、检查实际预览，并确认翻译符合源模板约束。
