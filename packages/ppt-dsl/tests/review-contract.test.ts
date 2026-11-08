import assert from "node:assert/strict";
import test from "node:test";
import { assertReviewMatchesManifest } from "../src/review-contract.js";
import type { TemplateManifest, ComponentManifest } from "../src/types.js";
test("compiler coverage rejects inherited-range drift, missing, duplicate and extra probes", () => {
  const node = (id: string, min: number, max: number): ComponentManifest => ({
    key: "text_1", kind: "text", ordinal: 1, rawDsl: "@文本", sampleContent: "示例",
    length: { min, max, fixed: false }, locator: { shapeId: id, shapeName: "@文本", nodeType: "sp", path: [0] },
  });
  const manifest: TemplateManifest = { manifestVersion: 2, templateSha256: "sha256", sourceTemplate: "fixture", generatedAt: "", slideCount: 1, slides: [{
    templateId: "slide_001", slideNumber: 1, slidePath: "ppt/slides/slide1.xml", pageType: "内容页", logic: [], warnings: [],
    nodes: [node("2", 1, 10)], lists: [{key:"list_1",listIndex:1,dynamic:true,minItems:1,maxItems:3,layout:"row",componentContract:[],
      items:[{itemIndex:1,groupLocator:{shapeId:"3",shapeName:"@1@1",nodeType:"grpSp",path:[1]},components:[node("4",2,20)]},
             {itemIndex:2,groupLocator:{shapeId:"5",shapeName:"@1@2",nodeType:"grpSp",path:[2]},components:[node("6",2,20)]}]}],
  }] };
  const probes = [["2","text",1,10],["4","text",2,20],["6","text",2,20],["3","list",1,3]].flatMap(([id,kind,min,max]) => [
    {key:`ppt/slides/slide1.xml#${id}`,kind,boundary:"min",value:min},
    {key:`ppt/slides/slide1.xml#${id}`,kind,boundary:"max",value:max},
  ]);
  assert.doesNotThrow(() => assertReviewMatchesManifest(manifest, [...probes].reverse()));
  assert.throws(() => assertReviewMatchesManifest(manifest, probes.slice(1)), /MISMATCH/);
  assert.throws(() => assertReviewMatchesManifest(manifest, [...probes, probes[0]]), /MISMATCH/);
  const drift = structuredClone(probes); drift[5].value = 10;
  assert.throws(() => assertReviewMatchesManifest(manifest, drift), /MISMATCH/);
  const extra = structuredClone(probes); extra[0].key += "-unknown";
  assert.throws(() => assertReviewMatchesManifest(manifest, extra), /MISMATCH/);
});
