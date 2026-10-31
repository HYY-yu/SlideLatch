export const locales = ['zh', 'en'] as const;
export type Locale = (typeof locales)[number];
export const isLocale = (value: string): value is Locale => locales.includes(value as Locale);

const zh = {
  navWorkflow: '体验 Demo', navDemo: '查看演示', languageLabel: '切换到英文',
  eyebrow: '你的模板。你的设计。',
  title: ['配置一次 PPT 模板，', '让 AI 按你的设计生成。'],
  description: '配置已有 PPT 模板，保留设计，让你常用的 AI 按规则准备内容。',
  primary: '看看生成效果',
  earlyTitle: '下一份报告，从你的设计开始。',
  earlyDescription: '首批模板试用正在准备中。', earlyStatus: '试用申请即将开放',
  footerTop: '回到顶部',
};
type Copy = { [K in keyof typeof zh]: (typeof zh)[K] };
const en: Copy = {
  navWorkflow: 'Try the demo', navDemo: 'Explore the demo', languageLabel: 'Switch to Chinese',
  eyebrow: 'YOUR TEMPLATE. YOUR DESIGN.',
  title: ['Your PowerPoint design.', 'Reused by AI.'],
  description: 'Configure an existing PowerPoint template. Keep your design and use your favorite AI to prepare content within its rules.',
  primary: 'See it in action',
  earlyTitle: 'Your next report starts with your design.',
  earlyDescription: 'We’re preparing our first template trials.', earlyStatus: 'Trial applications opening soon',
  footerTop: 'Back to top',
};
export const copy: Record<Locale, Copy> = { zh, en };
