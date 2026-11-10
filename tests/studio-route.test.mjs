import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { DOMParser } from '@xmldom/xmldom';

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
const studioShell = load('components/studio/studio-shell.tsx', {
  'next/link': link, '../pptx/svg-slide': leaf, './studio-shell.module.css': {__esModule:true,default:new Proxy({}, {get:(_,name)=>String(name)})},
}).default;
for (const locale of i18n.locales) test(`${locale}: loaded Studio keeps one canvas and exposes source slides without marketing steps`,()=>{
  const model={slides:Array.from({length:33},(_,index)=>({path:`ppt/slides/slide${index+1}.xml`,nodes:[]})),deck:{size:{width:960,height:540}}};
  const html=renderToStaticMarkup(React.createElement(studioShell,{
    locale,view:'template',model,fileName:'minimal-business-original.pptx',loading:false,busy:false,error:'',page:0,
    committedPatches:{},textPreviews:{},deck:{source:null,deck:{slides:[]},operation:'',error:'',notice:'',activeSlide:0,check:null},
    properties:null,input:React.createElement('input',{type:'file'}),canvas:React.createElement('svg',{'aria-label':'Source canvas'}),actions:null,workflow:null,issues:[],download:null,
  }));
  assert.equal((html.match(/<svg/g)||[]).length,1);
  assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
  assert.match(html,/minimal-business-original.pptx/);
  assert.match(html,locale==='zh'?/33 页源模板/:/33 source slides/);
  assert.doesNotMatch(html,/demo-stepper|三步体验|Explore the product in three steps|页面清单优先/);
});
const deckPresenter = props => props.render ? props.render({source:null,deck:{slides:[]},operation:'',error:'',notice:'',activeSlide:0,check:null}) : React.createElement('section',{id:'deck-studio'});
const demo = load('components/template-demo.tsx', Object.fromEntries([
  ['@/lib/pptx/copy', editor], ['@/lib/pptx/dsl', load('lib/pptx/dsl.ts')],
  ['@/lib/demo/template.json', JSON.parse(readFileSync(new URL('../lib/demo/template.json', import.meta.url)))],
  ['@/lib/demo/template.en.json', JSON.parse(readFileSync(new URL('../lib/demo/template.en.json', import.meta.url)))],
  ...['@/lib/analytics/browser', '@/lib/pptx/load', '@/lib/pptx/xml', '@/lib/pptx/validation', '@/lib/pptx/geometry', '@/lib/pptx/grouping', '@/lib/pptx/text-preview', '@/lib/pptx/shortcuts', '@/lib/pptx/marking'].map(name => [name, empty]),
  ['@/lib/pptx/lists', { slideLists: () => [] }], ['@/lib/workflow/studio-issue', load('lib/workflow/studio-issue.ts')],
  ...['./pptx/svg-slide', './pptx/workflow-panel', './pptx/list-objects', './pptx/list-settings', './pptx/text-length-controls'].map(name => [name, leaf]),
  ['./pptx/deck-studio', deckPresenter], ['./studio/studio-shell', studioShell],
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
    assert.doesNotMatch(studio, /id="demo-title"|demo-stepper|下一步|Next step/);
    assert.match(studio, /Slide.*Latch.*Studio/);
    assert.match(studio, new RegExp(`href="/${locale}"`));
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

test('both studio canonical URLs appear in the sitemap with reciprocal language alternatives', () => {
  const xml = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const entries = Array.from(doc.getElementsByTagName('url'));
  for (const locale of ['zh', 'en']) {
    const entry = entries.find(item => item.getElementsByTagName('loc')[0]?.textContent === `https://slidelatch.app/${locale}/deck-studio`);
    assert.ok(entry, `${locale} studio canonical URL is discoverable`);
    const alternatives = Array.from(entry.getElementsByTagNameNS('http://www.w3.org/1999/xhtml', 'link'));
    assert.deepEqual(alternatives.map(link => [link.getAttribute('hreflang'), link.getAttribute('href')]), [
      ['zh-CN', 'https://slidelatch.app/zh/deck-studio'],
      ['en', 'https://slidelatch.app/en/deck-studio'],
      ['x-default', 'https://slidelatch.app/zh/deck-studio'],
    ]);
  }
  assert.equal(entries.some(item => item.getElementsByTagName('loc')[0]?.textContent === 'https://slidelatch.app/deck-studio'), false);
  assert.equal(doc.getElementsByTagName('lastmod').length, 0);
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
