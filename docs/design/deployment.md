# Cloudflare 部署

正式域名：https://slidelatch.app 。项目名 `slidelatch`，来源为 GitHub `HYY-yu/SlideLatch` 的 `main` 分支。

使用 Cloudflare Pages 的 GitHub 集成；无需 Next.js 服务器、API 令牌或 OpenNext 适配器。框架预设选 None，构建命令 `npm run build:cloudflare`，输出目录 `out`，生产分支 `main`。本地生产构建前停止开发服务，避免共享 `.next/` 缓存发生冲突。

首页由 `public/_redirects` 将 `/` 重定向到 `/zh`；本地入口保留 meta refresh 降级。中英文地址为 `/zh`、`/en`，未知页面返回 404，不回落为 SPA 首页。PPT 解析、标记与导出继续在浏览器运行。

Cloudflare 构建环境中的 `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`、`NEXT_PUBLIC_POSTHOG_HOST` 会写入前端产物；修改后必须重建部署。未提供 token 时继续关闭分析，不影响试用入口。Tally 默认使用公开表单 `7XqVaa`。

上线后验收 HTTPS、根路径跳转、中英文切换、比较图片/PPTX 下载、33 页工作台、标记写回下载与 Tally Popup。部署失败保留构建日志，回滚使用 Cloudflare 已有成功部署版本。

## 搜索引擎入口

`public/sitemap.xml` 提供 `/zh`、`/en` 两个规范页面及对应 hreflang，`public/robots.txt` 声明完整 sitemap 地址。根地址重定向，不重复加入；页面内锚点不是独立页面。新增可索引页面时同步更新 sitemap，避免用构建时间伪造页面最后修改时间。

Google Search Console 建议添加 `slidelatch.app` 网域资源并完成 DNS 所有权验证，在 Sitemaps 中提交 `https://slidelatch.app/sitemap.xml`。发布文件不等于已在 Search Console 提交或已被 Google 收录。
