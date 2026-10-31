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
