import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { worldFrame } from '../lib/pptx/geometry.ts';
import { slideLists } from '../lib/pptx/lists.ts';
import { readSourceSlides, writePptx } from '../lib/pptx/xml.ts';
import {
  applyRepeatedElements, discoverRepeatedElements, previewListLayout, previewRepeatedElements,
} from '../lib/workflow/repeated-elements.ts';

globalThis.DOMParser = DOMParser;
globalThis.XMLSerializer = XMLSerializer;

async function fixture(locale) {
  const file = new URL(`../public/demo/minimal-business/${locale === 'en' ? 'en/' : ''}minimal-business-original.pptx`, import.meta.url);
  const bytes = await readFile(file);
  return { bytes, slides: await readSourceSlides(bytes), deck: { size: { width: 960, height: 540 }, slides: [] } };
}

function removeListMarks(nodes) {
  return Object.fromEntries(nodes.filter(node => /^@\d+@\d+/.test(node.name)).map(node => [node.key, {
    name: node.kind === 'grpSp' ? 'Source group' : node.name.replace(/^@\d+@\d+\s*/, '@'),
  }]));
}

test('Chinese and English demo cards are discovered before marking and preview the generated source order and geometry', async () => {
  for (const locale of ['zh', 'en']) {
    const model = await fixture(locale);
    const slideIndex = 29;
    const { nodes } = model.slides[slideIndex];
    const original = slideLists(nodes, {})[0];
    const patches = removeListMarks(nodes);
    const candidate = discoverRepeatedElements(model, slideIndex, patches).find(candidate => candidate.kind === 'native-groups');
    assert.ok(candidate);
    assert.equal(candidate.axis, 'row');
    assert.equal(candidate.items.length, 5);
    assert.deepEqual(candidate.items[0].members.map(member => member.role), ['sp:rect', 'numeric-text', 'text', 'text']);
    for (const count of [3, 5, 6]) {
      const preview = previewRepeatedElements(model, patches, candidate, count);
      assert.deepEqual(preview.issues, []);
      assert.equal(preview.fits, true);
      assert.deepEqual(preview.slots, previewListLayout(original, count).slots);
    }
    const componentKeys=candidate.items.flatMap(item=>item.members.map(member=>member.key));
    const unmarked={...patches,...Object.fromEntries(componentKeys.map(key=>[key,{name:'Source component'}]))};
    assert.equal(previewRepeatedElements(model, unmarked, candidate, 6).fits,true);
    assert.throws(() => applyRepeatedElements(model, unmarked, candidate, {min:3,max:6}), /REPEATED_ELEMENTS_COMPONENT_MARKS_REQUIRED/);
    const firstText = candidate.items[0].members.find(member => member.role === 'text');
    assert.throws(() => applyRepeatedElements(model, {...patches,[firstText.key]:{name:'@文本'}}, candidate, {min:3,max:6}), /REPEATED_ELEMENTS_FIRST_TEXT_RANGE_REQUIRED/);
    const result = applyRepeatedElements(model, patches, candidate, { min: 3, max: 6 });
    const changed = await readSourceSlides(await writePptx(model.bytes, result.patches));
    const configured = slideLists(changed[slideIndex].nodes, {})[0];
    assert.equal(configured.min, 3);
    assert.equal(configured.max, 6);
    assert.equal(configured.items.length, 5);
    assert.throws(() => previewRepeatedElements(model, result.patches, candidate, 4), /REPEATED_ELEMENTS_STALE_CANDIDATE/);
  }
});

test('loose number, heading and body shapes from the demo are grouped with unchanged world positions', async () => {
  const model = await fixture('zh');
  const slideIndex = 28;
  const { nodes } = model.slides[slideIndex];
  const patches = removeListMarks(nodes);
  const [candidate] = discoverRepeatedElements(model, slideIndex, patches);
  assert.equal(candidate.kind, 'loose-elements');
  assert.equal(candidate.items.length, 3);
  assert.deepEqual(candidate.items[0].members.map(member => member.role).sort(), ['numeric-text', 'text', 'text']);
  const result = applyRepeatedElements(model, patches, candidate, { min: 2, max: 4 });
  const marked = await readSourceSlides(await writePptx(model.bytes, result.patches));
  const list = slideLists(marked[slideIndex].nodes, {})[0];
  assert.equal(list.grouped, true);
  assert.equal(list.min, 2);
  assert.equal(list.max, 4);
  assert.deepEqual(list.items.map(item => item.nodes.filter(node => node.parentId).map(node => node.key)), candidate.items.map(item => item.rootKeys));
  for (const node of nodes) {
    const actual = marked[slideIndex].nodes.find(next => next.key === node.key);
    assert.equal(actual.text, node.text);
    const sourceFrame = worldFrame(node, nodes, {});
    const actualFrame = worldFrame(actual, marked[slideIndex].nodes, {});
    sourceFrame.forEach((value, index) => assert.ok(Math.abs(actualFrame[index] - value) < .0001));
  }
  assert.deepEqual(previewListLayout(list, 4).slots, previewRepeatedElements(model, patches, candidate, 4).slots);
});

test('count expansion rejects independent neighbors and overlapping items when runtime preserves a stagger', () => {
  const slidePath = 'ppt/slides/slide1.xml';
  const makeNode = (id, x, y, width = 50, height = 40, kind = 'sp') => ({
    id, key: `${slidePath}#${id}`, slidePath, kind, name: id, parentId: null, children: [], box: { x, y, width, height },
    childBox: null, rotation: 0, flipH: false, flipV: false, text: kind === 'sp' ? 'Heading' : '', marked: false,
  });
  const modelWith = (nodes) => ({ slides: [{ path: slidePath, nodes }], deck: { size: { width: 300, height: 200 }, slides: [] } });
  const neighbor = makeNode('4', 137, 100, 12, 10, 'pic');
  const aligned = modelWith([makeNode('2', 20, 100), makeNode('3', 200, 100), neighbor]);
  const [candidate] = discoverRepeatedElements(aligned, 0, {});
  assert.equal(previewRepeatedElements(aligned, {}, candidate, 2).fits, true);
  assert.deepEqual(previewRepeatedElements(aligned, {}, candidate, 3).issues, [
    { code: 'NEIGHBOR_OVERLAP', itemIndex: 1, key: neighbor.key },
  ]);
  const patches = {};
  assert.throws(() => applyRepeatedElements(aligned, patches, candidate, { min: 2, max: 3 }), /REPEATED_ELEMENTS_UNSAFE_LAYOUT: 3: NEIGHBOR_OVERLAP/);
  assert.deepEqual(patches, {});
  const staggered = modelWith([makeNode('2', 20, 60), makeNode('3', 100, 62)]);
  const [staggeredCandidate] = discoverRepeatedElements(staggered, 0, {});
  const preview = previewRepeatedElements(staggered, {}, staggeredCandidate, 3);
  assert.equal(preview.mode, 'pattern');
  assert.equal(preview.fits, false);
  assert.ok(preview.issues.some(issue => issue.code === 'ITEM_OVERLAP'));
});
