import type { Locale } from './i18n';

type SEOContent = {
  title: string; description: string; intro: string; status: string;
  audienceTitle: string; audience: string; workflowTitle: string;
  steps: { title: string; body: string }[];
  caseNote: string; resultsLink: string; demoLink: string; faqTitle: string;
  faqs: { question: string; answer: string }[];
};

export const seoCopy: Record<Locale, SEOContent> = {
  en: {
    title: 'PowerPoint Template Automation, Your Design | SlideLatch',
    description: 'Explore AI-assisted PowerPoint template automation for recurring reports. Try the browser demo, compare editable PPTX examples, and apply for early trials.',
    intro: 'For consulting, research, and report teams who reuse an existing PowerPoint template. Explore a workflow that gives AI content rules while keeping your slide design.',
    status: 'Early access · Try the built-in demo today. Uploading your own PPTX and full self-service generation are still in development.',
    audienceTitle: 'One PowerPoint template. Your next client report.',
    audience: 'A familiar design gives recurring reports a consistent starting point. SlideLatch is being developed for template owners and small teams preparing consulting reports, research updates, and repeat client presentations.',
    workflowTitle: 'How template reuse with AI works',
    steps: [
      { title: 'Prepare the template', body: 'Choose the text and image slots that can change, set text limits and list capacity, and keep the rest of the design fixed. Try marking objects in the built-in 33-slide demo.' },
      { title: 'Give your AI the content rules', body: 'The planned workflow provides a template contract for the AI you already use. AI prepares content within those rules; SlideLatch does not offer an AI chat or a live generation service on this page.' },
      { title: 'Review an editable PowerPoint', body: 'Compare the two pre-generated reports shown here, including text, images, lists, and native charts. Download the PPTX examples to inspect them in PowerPoint, or export your changes from the demo.' },
    ],
    caseNote: 'The growth and efficiency reports use fictional business content in the same prepared template. They show real, pre-generated PPTX files, rather than a live AI generation session.',
    resultsLink: 'Compare the generated reports', demoLink: 'Try the template demo',
    faqTitle: 'PowerPoint template reuse: questions and limits',
    faqs: [
      { question: 'Can I upload my own PowerPoint template now?', answer: 'Not yet. This public demo uses the built-in 33-slide template; the upload control is disabled. Apply for an early trial to discuss your template and recurring report workflow.' },
      { question: 'Does the demo generate a presentation with AI?', answer: 'The demo lets you edit template markings, node text, and layout, then download a modified PPTX. The generated report examples were prepared in advance with the existing template runtime. Full self-service AI generation is still in development.' },
      { question: 'Can I keep editing the downloaded file in PowerPoint?', answer: 'The downloads are PPTX files with editable PowerPoint objects. The browser preview approximates the design; fonts, charts, and complex effects may look different. Check the downloaded file in your PowerPoint environment. We do not claim compatibility with every Office version, Keynote, or Google Slides.' },
      { question: 'Are my presentation files uploaded by the demo?', answer: 'The built-in template is parsed and exported in your browser. There is no user-file upload in the current demo. The early-trial form is a separate Tally form; it is not a template upload service.' },
      { question: 'Does SlideLatch connect to Excel or schedule recurring reports?', answer: 'Data connectors, scheduling, and automatic distribution are not available. The current examples demonstrate template reuse; they do not prove unattended report automation or the correctness of customer data.' },
      { question: 'How do I try SlideLatch with my team?', answer: 'Use an Apply for a trial button and describe your repeated presentation task in the form. This is an early-trial application, not an instant account or a subscription checkout.' },
    ],
  },
  zh: {
    title: 'PPT 模板自动化：让 AI 沿用你的设计 | SlideLatch',
    description: '面向重复交付报告的团队，探索 AI 复用已有 PPT 模板的流程。体验浏览器标记 Demo、对比可编辑 PPTX 案例，申请首批试用。',
    intro: '面向反复使用同一套 PPT 模板的咨询、研究与报告团队。保留既有设计，为可修改内容设置规则，让常用的 AI 按模板准备内容。',
    status: '早期试用阶段 · 现在可体验内置模板。上传自己的 PPTX 与完整自助生成仍在开发中。',
    audienceTitle: '一套 PPT 模板，延续到下一份客户报告。',
    audience: '重复交付报告时，已有设计应该成为起点。SlideLatch 正在为模板负责人和小型报告团队开发可复用的配置流程，面向咨询报告、研究更新和结构相似的客户汇报。',
    workflowTitle: '如何让 AI 复用已有 PPT 模板',
    steps: [
      { title: '配置模板与可修改区域', body: '确认可变化的文字、图片槽位，设置字数与列表容量，其余设计保持固定。现在可在内置 33 页模板中体验对象标记。' },
      { title: '把内容规则交给常用 AI', body: '计划中的流程会提供模板合同，让你选择的 AI 按规则准备内容。当前网页没有内置 AI 聊天或实时生成服务。' },
      { title: '检查可继续编辑的 PPTX', body: '对比页面中两份预生成报告的文字、图片、列表和原生图表，下载 PPTX 到 PowerPoint 查看；也可以导出自己在 Demo 中的修改。' },
    ],
    caseNote: '增长与效率两份报告使用同一套已配置模板和虚构业务内容，展示的是提前生成的真实 PPTX，并非网页实时调用 AI 的结果。',
    resultsLink: '对比两份生成报告', demoLink: '体验模板配置 Demo',
    faqTitle: 'PPT 模板复用：常见问题与当前范围',
    faqs: [
      { question: '现在能上传自己的 PPT 模板吗？', answer: '暂时不能。公开 Demo 只开放内置的 33 页模板，上传按钮仍然禁用。可以申请首批试用，说明你的模板与重复报告任务。' },
      { question: '这个 Demo 会调用 AI 生成整份 PPT 吗？', answer: 'Demo 支持修改模板标记、节点文本和布局，并下载修改后的 PPTX。页面中的生成报告由现有模板运行时提前准备，完整的 AI 自助生成仍在开发中。' },
      { question: '下载后还能在 PowerPoint 中编辑吗？', answer: '下载文件为包含可编辑 PowerPoint 对象的 PPTX。浏览器预览是近似渲染，字体、图表和复杂特效可能存在差异，请在实际使用的 PowerPoint 环境中检查；不承诺全部 Office 版本、Keynote 或 Google Slides 一致。' },
      { question: '演示会上传我的演示文稿吗？', answer: '内置模板在浏览器中解析与导出，当前 Demo 没有用户文件上传。试用申请使用独立的 Tally 表单，不是模板上传服务。' },
      { question: '支持连接 Excel、定时生成周报吗？', answer: '目前没有数据连接器、调度或自动分发。案例展示模板复用效果，不代表已支持无人值守报告自动化，也不能证明客户数据的正确性。' },
      { question: '团队如何申请试用？', answer: '点击申请试用，在表单中描述重复制作演示文稿的场景。这是早期试用申请，不是即时开户或订阅购买。' },
    ],
  },
};
