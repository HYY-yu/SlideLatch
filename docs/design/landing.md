# Landing 维护

更新：2026-10-31。

- 视觉：Cruip Open 的深色底、蓝紫光效、渐变标题与留白。
- 内容：品牌主标题、三步 PPTX 工作台、早期试用说明。
- 界面：`/zh`、`/en`，语言切换后刷新保持对应路由；根路径转到 `/zh`。
- 工作台：左侧 33 页 SVG 缩略图，中间画布，右侧标记与布局面板。详见 [PPTX 工作台](pptx-workbench.md)。

## 修改入口

| 内容 | 文件 |
| --- | --- |
| Landing 文案 | `lib/i18n.ts` |
| 工作台文案 | `lib/pptx/copy.ts` |
| 页面结构 | `components/landing.tsx` |
| 工作台交互 | `components/template-demo.tsx` |
| 共享 SVG 渲染器 | `components/pptx/svg-slide.tsx` |
| 样式 | `app/globals.css` |
| SEO 标题与描述 | `app/[locale]/page.tsx` |

## 运行与检查

Node.js 22.6+，首次运行 `npm install`。

- `npm run dev`：本地预览，默认 `http://127.0.0.1:3000`。
- `npm test`：输入合同、标记、组合坐标、ZIP 保留与 PPTX 写回测试。
- `npm run typecheck`：TypeScript 检查。
- `npm run build`：生产构建；构建前停止 dev 服务，避免共用 `.next`。
- `npm start`：生产预览。

首版没有外部模型调用、用户数据收集或文件上传。标记及几何写回发生在浏览器，可下载新 PPTX；报名与用户模板上传尚未接入。


2026-11-02：工作台前新增真实生成对比区，Hero 主按钮指向 `#results`。详细输入、生成链路、静态素材与验收见 [真实生成对比](generated-showcase.md)。

2026-11-02：生成对比后新增连续点赞与第 4 次调查邀请，导航/结果区/页尾提供直接试用入口。PostHog 显式事件接线、环境变量与 Tally 申请流程见 [支持与事件分析](engagement-analytics.md)。


### 2026-11-02 灰白色与真实试用申请

整体使用浅灰底、白色面板和深灰文字，紫色保留为主操作与选中强调，点赞保留柔和粉色。`app/light-theme.css` 以 `html[data-theme="light"]` 提高覆盖优先级，统一导航、Hero、案例对比、工作台、属性表单、确认弹框与提示气泡；字体、布局和动效保持现有实现。PPT 内部原生配色不做过滤或重绘，表单保持 Tally 自身白色样式。

视觉目标：干净、克制的灰白产品工作台。内容顺序仍为产品承诺、真实生成对比、配置工作台、试用申请。动效保留标题入场、案例切换与随机爱心，减少动态效果设置继续生效。

Tally 使用公开表单 `7XqVaa` 的 modal Popup 替换待开放提示，真实打开回调和提交回调分别入分析事件。加载失败提供重试及公开表单直达；详细生命周期与隐私合同见 [支持与事件分析](engagement-analytics.md)。

### 2026-11-02 Galaxy 白底紫色星空

Dark Veil 的深色幕光与浅色页面不搭，按用户反馈改为 [React Bits Galaxy](https://reactbits.dev/backgrounds/galaxy)。视觉目标：白底、紫色星点，缓慢漂移与轻微闪烁，鼠标经过时星点避让。标题恢复深色，内容顺序与灰白工作台保持一致。

- `components/galaxy.tsx` 基于官方 TypeScript 源码、原生 WebGL2，无新增依赖；许可见 [React Bits 许可](../licenses/react-bits-LICENSE.md)。
- `components/galaxy-background.tsx` 延迟加载，设置 `lightMode`、不透明白底及紫色 palette，关闭点击加速和飞入效果，DPR 限制为 1，使用 3 层星点。
- 背景不拦截点击，不收集指针坐标；离屏/后台暂停，动态响应系统减少动态效果偏好；WebGL 不可用时保留白底并记录 Warn，上下文恢复后重建。
- 修正上游在 Strict Mode 清理时主动丢失上下文的问题；新增渲染生命周期、窗口缩放、减少动态效果与无 WebGL 合同测试。

验收：TypeScript 检查、40 项单测通过；Chrome 桌面与 390px 移动预览正常，鼠标移动后控制台无 Warn/Error。浅色 shader 保留紫色色相，避免上游 ink 映射让星点偏黑；最终预览：[白底紫星](previews/galaxy-white-purple.jpg)。

2026-11-02 背景层级收敛：星点密度参数从 0.8 降至 0.56（相同层数下空间数量约减半），透明度降至 0.42；减小光晕、星芒和闪烁，降低漂移与旋转速度。中心径向遮罩为标题及 CTA 留白，星点主要保留在两侧，移动端扩大中央留白。

2026-11-02 全页背景：按用户确认，将 Galaxy 改为固定于视口的单个全屏 Canvas，滚动至案例、工作台、试用及页尾时继续显示。移除首屏高度和底部渐隐限制，保留低密度、低亮度与中央留白；内容面板维持原有实色。渲染尺寸始终为视口大小，避免按整页高度分配 GPU 像素。
