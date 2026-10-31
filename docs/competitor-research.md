# 竞品与需求研究

核查日期：2026-10-31。以下区分用户体验与官方资料；付费功能及客户付款情况未核验。

## 竞品

| 产品 | 用户体验 | 官方能力与来源 | 待验证 |
| --- | --- | --- | --- |
| TurboDocx | 需在 PowerPoint 手工配置透明形状；AI 打标受付费限制 | [PPT 模板教程](https://docs.turbodocx.com/docs/TurboDocx%20Templating/How%20to%20Create%20a%20Presentation%20Template)、[故障说明](https://docs.turbodocx.com/docs/TurboDocx%20Templating/Template%20Troubleshooting) | 付费自动打标、图片/列表与独立合同 |
| SlideSpeak | 网页可编辑 PPT；Templates 受付费限制 | [品牌模板](https://docs.slidespeak.co/v1/branded-templates/branded-templates)提取品牌版式；[Onbrand](https://slidespeak.co/features/onbrand)提供 Agent 品牌上下文与 HTML/CSS 布局 | 原节点保留、容量合同、独立运行及复杂模板效果 |
| Plumsail | 偏表单填充，降低体验优先级 | [PPTX 文档](https://plumsail.com/docs/documents/v1.x/document-generation/pptx/index.html/)覆盖 token、列表、循环、图表、图片 | 作为相邻替代保留 |
| Slideform | 试用入口进入联系页；登录页未见独立注册入口，未试用 | 自动模板化、人工确认、字段映射、REST API | 原节点约束、合同导出、脱离平台运行及复杂 PPT 效果 |

### Slideform：直接竞品

- [自动模板化](https://helpcenter.slideform.co/how-to-create-a-slide-deck-template)：识别图表、图片、数字、日期、名称等内容，提出替换，由用户确认。
- [修改模板](https://helpcenter.slideform.co/how-to-edit-the-template-in-an-existing-project)：PPT 下载修改后重新上传；Google Slides 在源文件修改。
- [数据映射](https://helpcenter.slideform.co/data-mapping)：字段到来源映射；部分表格可原生编辑，也支持图片输出，全部图表的可编辑性未知。
- [REST API](https://helpcenter.slideform.co/hubfs/api-reference.html?hsLang=en)：读取字段、提交内容、轮询、下载，可由外部 AI/程序准备输入。
- [价格快照](https://slideform.co/solutions.html)：$200/月起，200 次 slide updates，不按席位收费；采购时重核。
- [G2 评论](https://www.g2.com/products/slideform/reviews)：有 Google Sheets→Google Slides 提案与重复报表的使用自述，也提到初期配置和管理界面摩擦。

研究重点：原对象配置成本、精确约束、可定位错误和独立生成。自动模板化与外部 AI 接入已有竞品覆盖。

## 需求线索

| 场景 | 痛点 | 来源 | 适配缺口 |
| --- | --- | --- | --- |
| 企业品牌周报 | AI 难以稳定沿用公司模板 | [用户原帖](https://www.reddit.com/r/ClaudeAI/comments/1odqne1/) | 用户地区与购买情况未知 |
| 销售月报 | 每月维护 4 份 PPT，数字解读文本更新繁琐 | [用户原帖](https://www.reddit.com/r/analytics/comments/1rm29wy/) | 还需确定性指标计算 |
| 多波次调研报告 | 问卷变化导致关联错图 | [用户原帖](https://www.reddit.com/r/Marketresearch/comments/1x6071p/) | 上游映射与统计工作较重 |

线索尚无付费证据，地区、时间与趋势待核实。后续优先获取真实模板、重复使用与购买行为，研究方法见 [用户验证](validation-plan.md)。

历史研究入口：OpportunityRadar 项目“PPT 长尾需求 · 东南亚 · 2026-10-27”，包含 3 条新机会笔记和 1 条决策。Presenton、office-kit 仅有检索线索，待需要时再调查。
