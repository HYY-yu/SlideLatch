import type { Locale } from '../i18n';
const zh = {
  title: '三步体验产品功能', note: '交互演示 · 修改仅在当前页面有效',
  steps: ['选择模板', '调整区域', '预览效果'],
  template: '极简商务', templateMeta: '33 页',
  choose: '选择这个模板', upload: '上传 PPT', uploadHint: '功能正在开发中',
  selectTitle: '从一个已有模板开始', selectDescription: '先用极简商务，体验一次模板配置。',
  editTitle: '点击 PPT 上的文字', editDescription: '修改内容，或将这个区域设为固定。',
  field: '区域', content: '预览文字', editable: '允许 AI 修改', fixed: '固定内容', dynamic: '可修改',
  limits: '字数范围', characters: '字', invalid: '请按字数范围调整文字', invisible: '请移除不可见字符或特殊空白',
  preview: '预览效果', back: '返回调整', reset: '重置',
  resultTitle: '设计不变，内容由你。', resultDescription: '这就是本次调整的网页预览。',
  download: '下载原始模板', downloadNote: '下载的是原始 33 页模板，不含本次演示修改。',
  aiHint: '正式使用时，可让你常用的 AI 按模板规则准备新内容。',
  canvasLabel: '极简商务封面', selectField: '选择区域', image: '图片区域', imageHint: '模板原图保留；本版先体验文字区域。',
  fieldNames: ['页眉', '主标题', '副标题', '报告说明', '汇报团队', '报告日期'],
  editingStatus: '点击虚线框选择区域', previewStatus: '网页预览 · 不会生成新文件', originalStatus: '真实模板封面 · 第 1 / 33 页',
  restart: '重新选择', overview: '查看全部页面', overviewTitle: '极简商务 · 全部 33 页', overviewAlt: '极简商务模板的 33 页版式总览', closeOverview: '关闭预览', originalImage: '查看原图',
};
type Copy = { [K in keyof typeof zh]: (typeof zh)[K] };
const en: Copy = {
  title: 'Explore the product in three steps', note: 'Interactive demo · Changes stay on this page',
  steps: ['Choose a template', 'Adjust regions', 'Preview the result'],
  template: 'Minimal Business', templateMeta: '33 slides',
  choose: 'Use this template', upload: 'Upload PPT', uploadHint: 'This feature is in development',
  selectTitle: 'Start with a ready-made template', selectDescription: 'Try configuring Minimal Business first.',
  editTitle: 'Click the text on the slide', editDescription: 'Change its content, or keep the region fixed.',
  field: 'Region', content: 'Preview text', editable: 'Allow AI to change this', fixed: 'Fixed content', dynamic: 'Editable',
  limits: 'Length range', characters: 'characters', invalid: 'Adjust the text to fit the length range', invisible: 'Remove invisible characters or unusual spaces',
  preview: 'Preview the result', back: 'Back to editing', reset: 'Reset',
  resultTitle: 'Same design. Your content.', resultDescription: 'Here is a browser preview of your changes.',
  download: 'Download original template', downloadNote: 'The download is the original 33-slide template, without your demo changes.',
  aiHint: 'For future reports, use your favorite AI to prepare new content within the template’s rules.',
  canvasLabel: 'Minimal Business cover', selectField: 'Select region', image: 'Image region', imageHint: 'The original photo stays in place. Try the text regions in this version.',
  fieldNames: ['Header', 'Title', 'Subtitle', 'Description', 'Team', 'Date'],
  editingStatus: 'Click an outlined region to select it', previewStatus: 'Browser preview · No new file is generated', originalStatus: 'Original template cover · Slide 1 / 33',
  restart: 'Choose again', overview: 'View all slides', overviewTitle: 'Minimal Business · All 33 slides', overviewAlt: 'Overview of all 33 slide layouts in the Minimal Business template', closeOverview: 'Close preview', originalImage: 'Open full-size image',
};
export const demoCopy: Record<Locale, Copy> = { zh, en };
