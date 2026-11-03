import type { Locale } from './i18n';

type SEOContent = {
  title: string; description: string;
  workflowTitle: string;
  steps: { title: string; body: string }[];
  faqTitle: string;
  faqs: { question: string; answer: string }[];
};

export const seoCopy: Record<Locale, SEOContent> = {
  en: {
    title: 'PowerPoint Template Automation, Your Design | SlideLatch',
    description: 'Explore AI-assisted PowerPoint template automation for recurring reports. Try the browser demo, compare editable PPTX examples, and apply for early trials.',
    workflowTitle: 'Template reuse in three steps',
    steps: [
      { title: 'Prepare the template', body: 'Mark editable slots and set content limits.' },
      { title: 'Give your AI the content rules', body: 'Use the template rules to guide your AI.' },
      { title: 'Review an editable PowerPoint', body: 'Check the output in PowerPoint.' },
    ],
    faqTitle: 'FAQ',
    faqs: [
      { question: 'Can I upload my own PowerPoint template now?', answer: 'Not yet. This public demo uses the built-in 33-slide template; the upload control is disabled. Apply for an early trial to discuss your template and recurring report workflow.' },
      { question: 'Does the demo generate a presentation with AI?', answer: 'The demo lets you edit template markings, node text, and layout, then download a modified PPTX. The generated report examples were prepared in advance with the existing template runtime. Full self-service AI generation is still in development.' },
      { question: 'Can I keep editing the downloaded file in PowerPoint?', answer: 'The downloads are PPTX files with editable PowerPoint objects. The browser preview approximates the design; fonts, charts, and complex effects may look different. Check the downloaded file in your PowerPoint environment. We do not claim compatibility with every Office version, Keynote, or Google Slides.' },
      { question: 'Are my presentation files uploaded by the demo?', answer: 'The built-in template is parsed and exported in your browser. There is no user-file upload in the current demo. The early-trial form is a separate Tally form; it is not a template upload service.' },
    ],
  },
  zh: {
    title: 'PPT 模板自动化：让 AI 沿用你的设计 | SlideLatch',
    description: '面向重复交付报告的团队，探索 AI 复用已有 PPT 模板的流程。体验浏览器标记 Demo、对比可编辑 PPTX 案例，申请首批试用。',
    workflowTitle: '三步复用 PPT 模板',
    steps: [
      { title: '配置模板与可修改区域', body: '标记可编辑区域，设定内容限制。' },
      { title: '把内容规则交给常用 AI', body: '让常用的 AI 按模板规则准备内容。' },
      { title: '检查可继续编辑的 PPTX', body: '在 PowerPoint 中检查可编辑的成稿。' },
    ],
    faqTitle: '常见问题',
    faqs: [
      { question: '现在能上传自己的 PPT 模板吗？', answer: '暂时不能。公开 Demo 只开放内置的 33 页模板，上传按钮仍然禁用。可以申请首批试用，说明你的模板与重复报告任务。' },
      { question: '这个 Demo 会调用 AI 生成整份 PPT 吗？', answer: 'Demo 支持修改模板标记、节点文本和布局，并下载修改后的 PPTX。页面中的生成报告由现有模板运行时提前准备，完整的 AI 自助生成仍在开发中。' },
      { question: '下载后还能在 PowerPoint 中编辑吗？', answer: '下载文件为包含可编辑 PowerPoint 对象的 PPTX。浏览器预览是近似渲染，字体、图表和复杂特效可能存在差异，请在实际使用的 PowerPoint 环境中检查；不承诺全部 Office 版本、Keynote 或 Google Slides 一致。' },
      { question: '演示会上传我的演示文稿吗？', answer: '内置模板在浏览器中解析与导出，当前 Demo 没有用户文件上传。试用申请使用独立的 Tally 表单，不是模板上传服务。' },
    ],
  },
};
