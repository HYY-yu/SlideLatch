export const locales = ['zh', 'en'] as const;
export type Locale = (typeof locales)[number];
export const isLocale = (value: string): value is Locale => locales.includes(value as Locale);

const zh = {
  navStudio: '工作台', navWorkflow: '体验 Demo', navDemo: '查看演示', languageLabel: '切换到英文',
  eyebrow: '你的模板。你的设计。',
  title: ['复用已有 PPT 模板，', '让 AI 沿用你的设计。'],
  description: '配置已有 PPT 模板，保留设计，让你常用的 AI 按规则准备内容。',
  primary: '看看生成效果',
  earlyTitle: '下一份报告，从你的设计开始。',
  earlyDescription: '告诉我你的使用场景，申请首批模板试用。',
  footerTop: '回到顶部',
};
type Copy = { [K in keyof typeof zh]: (typeof zh)[K] };
const en: Copy = {
  navStudio: 'Deck studio', navWorkflow: 'Try the demo', navDemo: 'Explore the demo', languageLabel: 'Switch to Chinese',
  eyebrow: 'YOUR TEMPLATE. YOUR DESIGN.',
  title: ['Your PowerPoint template.', 'Reused with AI.'],
  description: 'Configure an existing PowerPoint template. Keep your design and use your favorite AI to prepare content within its rules.',
  primary: 'See it in action',
  earlyTitle: 'Your next report starts with your design.',
  earlyDescription: 'Tell us about your use case and apply for the first template trials.',
  footerTop: 'Back to top',
};
export const copy: Record<Locale, Copy> = { zh, en };
