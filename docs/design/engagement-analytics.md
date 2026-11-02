# 支持、试用申请与事件分析

更新：2026-11-02。

## 用户交互

生成对比区底部提供“支持一下”和直接“申请试用”。导航与页尾同样提供直接申请入口，无需先点赞。每次点赞增加个人计数，配合心形弹跳和随机三次 Bézier 曲线飘散动画；文案明确“你送出的赞”，不表示全站点赞量或独立支持人数。动画节点和计时器有数量上限并在卸载时清理，尊重 reduced-motion。

第 4 次点赞（超过 3 次）首次展示邀请气泡。“愿意”关闭气泡并进入调查/试用入口；“暂时不了”只关闭邀请。两者都会让本次浏览不再自动邀请，后续仍能继续点赞或主动申请。点赞计数、已邀请状态使用 `sessionStorage`，同一标签页刷新或切换语言继续保留，新浏览会话独立；不宣称跨设备或全站计数。存储被禁用或损坏时 Warn 日志并降级到内存，不阻塞使用。

## Tally Popup（已接入）

公开表单为 https://tally.so/r/7XqVaa，包含三个中英双语问题：最近一次复用 PPT 的任务与痛点、现有解决方式及耗时、接收试用邀请的邮箱。表单本身包含用途说明与联系授权，网站不改动远端表单。

导航、生成结果、页尾的申请按钮，以及点赞气泡的“愿意”，均通过官方 `Tally.openPopup` 打开同一表单。使用 modal 布局、640px 宽、左对齐内容和背景遮罩，保留表单标题；窄屏由 Tally 组件约束到视口。只有点击申请后才加载 `https://tally.so/widgets/embed.js`，共享 SDK 加载 Promise，防止重复脚本和重复弹窗。

`.env.example` 提供 `NEXT_PUBLIC_TALLY_FORM_ID=7XqVaa`，无配置时使用该已确认的表单。只接受公开 Form ID，不接受管理页链接、脚本或任意 URL。

- CTA 点击与真正打开分别计数。打开事件来自官方 onOpen；关闭使用 onClose。
- 提交事件只来自该表单的 onSubmit，核对 formId 并在单次 Popup 中去重；不会把点击、关闭或错误弹框当成成功。
- onSubmit 的字段、邮箱、回答、respondentId 和 submissionId 不传给 PostHog 或控制台，只记录表单 ID、入口、界面语言与是否完成。
- SDK 加载与弹窗打开各设 15 秒超时，失败 Warn 日志并显示重试/直接打开公开表单的入口；不会退回“即将开放”占位。
- 切换页面/组件卸载会清理打开计时器并关闭活动 Popup。默认不自动关闭提交后的感谢页，由用户自行关闭。

## PostHog 配置

安装官方 `posthog-js` SDK，动态加载 `posthog-js/dist/module.no-external`。不使用用户个人 API key，也不读取或修改任何 PostHog 项目配置。使用 `.env.example` 建立 `.env.local`，部署时配置同名构建环境变量：

```sh
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=你的公开项目令牌
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
NEXT_PUBLIC_POSTHOG_CAPTURE_LOCAL=false
NEXT_PUBLIC_ANALYTICS_DEBUG=false
```

HOST 需根据实际项目选择 US/EU 或自托管 HTTPS 地址，不要把个人 API key 放进公开变量。更新 `NEXT_PUBLIC_` 配置后需重启开发服务或重新构建。缺少令牌/host 时不初始化 SDK、不发送数据；本机默认不发送，即使已经配置令牌。测试真实项目时显式设置 `NEXT_PUBLIC_POSTHOG_CAPTURE_LOCAL=true`。开发环境默认在控制台记录已过滤的事件；配置 DEBUG=false 可关闭，生产默认关闭。

PostHog 当前没有提供真实项目令牌，因此已完成事件接线、可测试适配层与配置开关，尚未完成真实 PostHog 后台收数验收。

## 事件合同

| 事件 | 触发时机 | 自定义属性 |
| --- | --- | --- |
| `landing_viewed` | 页面加载，每个语言路由一次 | 公共属性 |
| `showcase_viewed` | 对比区至少 25% 进入可视区，当前页面一次 | 公共属性 |
| `showcase_case_selected` | 实际切换案例 | `case_id` |
| `showcase_feature_selected` | 实际切换能力类型 | `case_id`, `feature` |
| `showcase_preview_opened` | 点击放大预览 | `case_id`, `feature` |
| `showcase_download_clicked` | 点击案例下载，不等同于下载完成 | `case_id`, `feature` |
| `workbench_viewed` | 工作台至少 25% 进入可视区，当前页面一次 | 公共属性 |
| `workbench_started` | 模板成功解析后首次进入编辑，当前页面一次 | 公共属性 |
| `workbench_export_succeeded` | PPTX 写回及回读校验成功，不等同于下载 | 公共属性 |
| `workbench_export_failed` | 写回失败，仍保留工作台数据 | `reason=write_failed` |
| `workbench_download_clicked` | 点击修改后 PPTX 下载 | 公共属性 |
| `support_clicked` | 每次点赞 | `like_count`, `entry_point=results` |
| `survey_invitation_shown` | 第 4 次点赞出现气泡 | `like_count` |
| `survey_invitation_accepted` | 用户点击愿意 | `like_count` |
| `survey_invitation_dismissed` | 用户点击暂时不了 | `like_count` |
| `trial_cta_clicked` | 直接申请或同意调查 | `entry_point` |
| `survey_form_opened` | 官方 onOpen，真实 Popup 打开 | `entry_point`, `form_id` |
| `survey_submitted` | 官方 onSubmit 且 formId 匹配，单次 Popup 去重 | `entry_point`, `form_id` |
| `survey_form_closed` | 官方 onClose，单次 Popup 去重 | `entry_point`, `form_id`, `outcome=submitted/abandoned` |
| `survey_form_load_failed` | SDK 加载/Popup 打开异常或超时 | `entry_point`, `form_id`, `reason=tally_load_failed` |

公共属性仅为 `locale`、`page_path`（/zh 或 /en）、`environment`；维度使用固定枚举白名单，`entry_point` 为 header/results/footer/support_survey。公开 `form_id` 仅接受 5–24 位字母数字；`outcome` 只允许 submitted/abandoned。计数须为非负安全整数。PostHog SDK 保留匿名 distinct_id 与必要设备/会话信息；不 identify 邮箱、不创建人员档案，关闭 autocapture、自动 pageview/pageleave、录屏、自动异常、性能采集、热图、问卷、产品引导和实验；尊重 Do Not Track。使用 before_send 丢弃非本项目事件，并移除 SDK URL/referrer/UTM 等属性，避免落地 URL 中的查询参数进入分析。

不发送 PPT 内容、模板文本、原始对象 ID、文件名、邮箱或表单原文。SDK 加载/采集/请求失败均有 Warn 日志，不阻塞交互；初始化期间有上限为 100 的内存事件队列，不在应用中持久化队列。初始化失败后本页降级，配置修复后刷新重试。

## 漏斗与验收

当前看：`landing_viewed → showcase_viewed → workbench_started / showcase_download_clicked → trial_cta_clicked`，以及 `support_clicked → survey_invitation_shown → survey_invitation_accepted`。以独立访客和分入口转化率为主，点赞次数只描述互动强度；CTA 点击不算合格线索，使用实际 `survey_submitted` 作为申请终点，并结合 Tally 中的答案判断是否合格。

测试覆盖第 4 次阈值、关闭/接受后抑制、刷新状态恢复、损坏存储、安全计数、无配置/本地默认不上报、属性过滤、SDK 异步排队、重复 view 去重与故障降级。浏览器验证真实表单的打开、关闭与重复打开，覆盖导航、结果区、页尾、点赞邀请和英文入口，未向正式表单提交测试数据。提交回调以模拟 payload 校验去重、表单匹配和隐私过滤。类型检查、35 项测试和生产构建通过；实际 PostHog 后台收数仍待配置后验收。

## 维护入口与参考

- `components/engagement.tsx`：点赞、气泡、直接 CTA 与 Tally Popup/错误恢复。
- `components/analytics.tsx`：页面与区域曝光。
- `lib/engagement/tally.ts`：官方 SDK 加载、表单配置与生命周期合同。
- `lib/engagement/support.ts`：支持状态及持久化合同。
- `lib/analytics/events.ts`：事件白名单、维度与 SDK 属性过滤。
- `lib/analytics/core.ts` / `browser.ts`：可测试传输适配、条件初始化与官方 SDK。
- [PostHog Next.js 接入](https://posthog.com/docs/libraries/next-js)、[SDK 配置](https://posthog.com/docs/libraries/js/config)、[Tally 弹窗](https://tally.so/help/popup-forms)。

### 随机爱心轨迹

`lib/engagement/heart-particles.ts` 在每次点赞时生成 5–7 颗粒子，随机起点、两个控制点、终点、时长、延迟、大小、颜色与旋转。轨迹使用三次 Bézier 曲线采样为 31 个关键帧，由 Web Animations API 插值播放并渐隐；随机参数保存在粒子状态中，组件重新渲染不会改变飞行路径。每次持续约 0.9–1.5 秒，支持连续叠加，最多 6 组/42 颗可见粒子；到期移除并取消动画，卸载清理计时器。减少动态效果时不创建飘散粒子，点赞计数与调查逻辑继续工作。新增测试覆盖曲线端点、曲率、随机多样性、上升方向与各参数边界；浏览器确认粒子具有不同大小和位置。

## 共享 PostHog 项目

复用现有项目，所有事件由传输层强制附加 `app=slidelatch`，调用方不能覆盖。与 Duck Rush 的 `app=duck_rush` 使用同一维度；报表与漏斗统一加 `app=slidelatch` 筛选。保留 locale/environment 维度。项目使用 EU 区域时，ingestion host 配置为 `https://eu.i.posthog.com`，无需新建项目或个人 API Key。
