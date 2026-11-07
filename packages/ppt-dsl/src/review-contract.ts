import type { TemplateManifest } from "./types.js";
import { assertRuntimeManifestComplete } from "./manifest-contract.js";
type ProbeContract = { key: string; kind: "text" | "list"; boundary: "min" | "max"; value: number };
/** Compare exact compiler-resolved locators, including inherited list contracts.
 * This verifies coverage only, not observation authenticity or visual correctness.
 */
export function assertReviewMatchesManifest(manifest: TemplateManifest, probes: unknown): void {
  assertRuntimeManifestComplete(manifest);
  if (!Array.isArray(probes)) throw new Error("REVIEW_COMPILER_PROBES_REQUIRED");
  const expected: ProbeContract[] = [];
  const add = (key: string, kind: ProbeContract["kind"], min: number, max: number) => {
    expected.push({ key, kind, boundary: "min", value: min }, { key, kind, boundary: "max", value: max });
  };
  for (const slide of manifest.slides) {
    for (const node of [...slide.nodes, ...slide.lists.flatMap(l => l.items.flatMap(i => i.components))]) {
      if (node.kind === "text" && node.length) add(`${slide.slidePath}#${node.locator.shapeId}`, "text", node.length.min, node.length.max);
    }
    for (const list of slide.lists) if (list.dynamic) {
      const locator = list.items[0]?.groupLocator;
      if (!locator) throw new Error("REVIEW_COMPILER_LIST_LOCATOR_MISSING");
      add(`${slide.slidePath}#${locator.shapeId}`, "list", list.minItems, list.maxItems);
    }
  }
  const signature = (p: ProbeContract) => JSON.stringify([p.key, p.kind, p.boundary, p.value]);
  const actual = probes.map(p => {
    if (!p || typeof p !== "object" || typeof p.key !== "string" || !["text", "list"].includes(p.kind) || !["min", "max"].includes(p.boundary) || !Number.isInteger(p.value)) throw new Error("REVIEW_COMPILER_INVALID_PROBE");
    return signature(p);
  }).sort();
  const required = expected.map(signature).sort();
  if (new Set(actual).size !== actual.length || JSON.stringify(actual) !== JSON.stringify(required)) throw new Error("REVIEW_COMPILER_CONTRACT_MISMATCH");
}
