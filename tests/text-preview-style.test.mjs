import assert from 'node:assert/strict';
import test from 'node:test';
import { DOMParser } from '@xmldom/xmldom';
import JSZip from 'jszip';
import { isTextGradient } from '../lib/pptx/rich-text.ts';
import { NS, readSourceSlides } from '../lib/pptx/xml.ts';

globalThis.DOMParser = DOMParser;

test('gradient text accepts the parser’s colors without accepting arbitrary background images', () => {
  assert.ok(isTextGradient('linear-gradient(120deg, #249087 53%, #30C0B4 100%)'));
  assert.ok(isTextGradient('linear-gradient(180deg, rgb(255, 255, 255) 0%, rgba(255, 255, 255, 0) 81%)'));
  assert.ok(isTextGradient('linear-gradient(rgb(255, 255, 255) 0%, rgba(255, 255, 255, 0) 81%)'));
  assert.ok(!isTextGradient('linear-gradient(120deg, #249087 53%, #30C0B4 100%), url(https://example.com/img)'));
  assert.ok(!isTextGradient('linear-gradient(120deg, var(--evil) 0%, #000 100%)'));
  assert.ok(!isTextGradient('linear-gradient(120deg, #000 0%, #fff 100%); color: red'));
});

test('source-only text runs retain position, no-fill line width, resolved theme color, and gradient opacity', async () => {
  const zip = new JSZip();
  const relations = (body) => `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>`;
  zip.file('ppt/presentation.xml', `<p:presentation xmlns:p="${NS.p}" xmlns:r="${NS.r}"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`);
  zip.file('ppt/_rels/presentation.xml.rels', relations(
    `<Relationship Id="rId1" Type="${NS.r}/slide" Target="slides/slide1.xml"/>
     <Relationship Id="rId2" Type="${NS.r}/theme" Target="theme/theme1.xml"/>`));
  zip.file('ppt/theme/theme1.xml', `<a:theme xmlns:a="${NS.a}"><a:themeElements><a:clrScheme><a:accent5><a:srgbClr val="249087"/></a:accent5></a:clrScheme></a:themeElements></a:theme>`);
  zip.file('ppt/slides/slide1.xml', `<p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:cSld><p:spTree>
    <p:sp><p:nvSpPr><p:cNvPr id="2" name="Text"/></p:nvSpPr><p:txBody>
      <a:p><a:r><a:t>Regular paragraph</a:t></a:r></a:p>
      <a:p><a:r><a:t>Regular run</a:t></a:r><a:r><a:rPr><a:ln w="25400"><a:gradFill>
        <a:gsLst><a:gs pos="0"><a:schemeClr val="accent5"/></a:gs>
        <a:gs pos="81000"><a:schemeClr val="accent5"><a:alpha val="0"/></a:schemeClr></a:gs></a:gsLst>
        <a:lin ang="5400000"/>
      </a:gradFill></a:ln><a:noFill/></a:rPr><a:t>Outlined run</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld></p:sld>`);

  const bytes = await zip.generateAsync({ type: 'uint8array' });
  const [slide] = await readSourceSlides(bytes, { textOutlines: true });
  assert.equal((await readSourceSlides(bytes))[0].nodes[0].textOutlines, undefined);
  assert.deepEqual(slide.nodes[0].textOutlines, [{
    index: 1,
    runs: [
      { text: 'Regular run', outline: undefined },
      {
        text: 'Outlined run',
        outline: {
          width: 2,
          removeFill: true,
          color: '#249087',
          mask: 'linear-gradient(180deg, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0) 81%)',
        },
      },
    ],
  }]);
});
