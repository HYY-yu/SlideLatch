import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

function load(relative, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8'), {
    compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: name => {
    if (name === 'react') return React;
    if (name === 'react/jsx-runtime') return jsx;
    if (name in imports) return imports[name];
    throw new Error(`Unexpected component dependency: ${name}`);
  } });
  return exports;
}

const empty = {};
const leaf = () => null;
const link = ({ children, href, ...props }) => React.createElement('a', { ...props, href }, children);
const i18n = load('lib/i18n.ts');
const editor = load('lib/pptx/copy.ts');
const demo = load('components/template-demo.tsx', Object.fromEntries([
  ['@/lib/pptx/copy', editor], ['@/lib/pptx/dsl', load('lib/pptx/dsl.ts')],
  ['@/lib/demo/template.json', JSON.parse(readFileSync(new URL('../lib/demo/template.json', import.meta.url)))],
  ['@/lib/demo/template.en.json', JSON.parse(readFileSync(new URL('../lib/demo/template.en.json', import.meta.url)))],
  ...['@/lib/analytics/browser', '@/lib/pptx/load', '@/lib/pptx/xml', '@/lib/pptx/validation', '@/lib/pptx/geometry', '@/lib/pptx/grouping', '@/lib/pptx/text-preview', '@/lib/pptx/shortcuts', '@/lib/pptx/marking'].map(name => [name, empty]),
  ['@/lib/pptx/lists', { slideLists: () => [] }],
  ...['./pptx/svg-slide', './pptx/workflow-panel', './pptx/list-objects', './pptx/list-settings', './pptx/text-length-controls'].map(name => [name, leaf]),
  ['./pptx/deck-studio', () => React.createElement('section', { id: 'deck-studio' })],
])).default;

for (const locale of i18n.locales) {
  test(`${locale}: landing demo keeps public-template controls and excludes studio authoring`, () => {
    const html = renderToStaticMarkup(React.createElement(demo, { locale }));
    assert.match(html, /id="demo-title"/);
    assert.match(html, new RegExp(editor.editorCopy[locale].choose));
    assert.doesNotMatch(html, /type="file"|id="deck-studio"/);
    const studio = renderToStaticMarkup(React.createElement(demo, { locale, mode: 'studio' }));
    assert.match(studio, /type="file"/);
    assert.match(studio, /id="deck-studio"/);
  });
}

const route = load('app/[locale]/deck-studio/page.tsx', {
  'next/link': link, 'next/navigation': { notFound: () => { throw new Error('NOT_FOUND'); } },
  '@/components/template-demo': demo, '@/lib/i18n': i18n,
});
for (const locale of i18n.locales) {
  test(`${locale}: studio can open directly, return home and switch to the other studio locale`, async () => {
    const params = Promise.resolve({ locale });
    const html = renderToStaticMarkup(await route.default({ params }));
    assert.match(html, new RegExp(`href="/${locale}"`));
    assert.match(html, new RegExp(`href="/${locale === 'zh' ? 'en' : 'zh'}/deck-studio"`));
    assert.match(html, /id="deck-studio"/);
    const metadata = await route.generateMetadata({ params });
    assert.equal(metadata.alternates.canonical, `https://slidelatch.app/${locale}/deck-studio`);
  });
}
test('unsupported studio locales fail closed', async () => {
  await assert.rejects(route.default({ params: Promise.resolve({ locale: 'fr' }) }), /NOT_FOUND/);
});

const landing = load('components/landing.tsx', {
  'next/link': link, '@/lib/i18n': i18n, './template-demo': demo,
  '@/lib/seo-copy': load('lib/seo-copy.ts'), './galaxy-background': leaf,
  './generated-showcase': leaf, './analytics': leaf,
  './engagement': { EngagementProvider: ({ children }) => children, TrialButton: leaf },
}).default;
for (const locale of i18n.locales) {
  test(`${locale}: product homepage links to the full studio without embedding it`, () => {
    const html = renderToStaticMarkup(React.createElement(landing, { locale }));
    assert.match(html, new RegExp(`href="/${locale}/deck-studio"`));
    assert.match(html, /id="hero-title"/);
    assert.match(html, /id="demo-title"/);
    assert.doesNotMatch(html, /id="deck-studio"|type="file"/);
  });
}
