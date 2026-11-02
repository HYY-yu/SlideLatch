import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createConfig, validateText, invalidFields } from '../lib/demo/model.ts';

const template = JSON.parse(readFileSync(new URL('../lib/demo/template.json', import.meta.url), 'utf8'));

test('text contract accepts inclusive bounds and counts emoji as one visible code point', () => {
  assert.equal(validateText('年度', 2, 8).valid, true);
  assert.equal(validateText('年度总结业务复盘', 2, 8).valid, true);
  assert.equal(validateText('年', 2, 8).valid, false);
  assert.equal(validateText('年度总结业务复盘会', 2, 8).valid, false);
  assert.equal(validateText('前进🚀', 3, 3).count, 3);
  assert.equal(validateText('前进🚀', 3, 3).valid, true);
});

test('invisible characters cannot bypass the cover text contract', () => {
  assert.equal(validateText('年度\u200b', 2, 8).valid, false);
  assert.equal(validateText('年度\u0000', 2, 8).valid, false);
  assert.equal(validateText('年度\u00a0报告', 2, 8).valid, false);
  assert.equal(validateText('年度\r报告', 2, 8).valid, false);
  assert.equal(validateText('  A\n B  ', 3, 3).valid, true);
});

test('invalid fields can be located and resetting creates fresh unsaved state', () => {
  const first = createConfig(template.fields);
  assert.deepEqual(invalidFields(template.fields, first), []);
  first.text_2.text = '超出封面标题的最大字数';
  first.text_2.dynamic = false;
  assert.deepEqual(invalidFields(template.fields, first), ['text_2']);
  const second = createConfig(template.fields);
  assert.equal(second.text_2.text, template.fields[1].sample);
  assert.equal(second.text_2.dynamic, true);
});

test('bundled template download matches its declared hash and cover metadata', () => {
  const bytes = readFileSync(new URL(`../public${template.downloadUrl}`, import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), template.sha256);
  assert.equal(template.slideCount, 33);
  for (const field of template.fields) {
    assert.ok(field.x >= 0 && field.y >= 0 && field.x + field.width <= 100.001 && field.y + field.height <= 100.001);
  }
});
