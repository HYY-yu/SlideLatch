import { parseComponentName } from '../../packages/ppt-dsl/src/dsl/parse.ts';
import { planDynamicListLayout } from '../../packages/ppt-dsl/src/pptx/layout.ts';
import { boxFor, frame, point, worldFrame } from '../pptx/geometry.ts';
import { editListMembers } from '../pptx/grouping.ts';
import { slideLists, type SlideList } from '../pptx/lists.ts';
import { EMU_PER_PT } from '../pptx/xml.ts';
import type { Box, LoadedTemplate, Patches, RenderElement, SourceNode } from '../pptx/types';

type Axis = 'row' | 'column';
type RepeatedMember = { key: string; role: string; box: Box };
export type RepeatedItem = { rootKeys: string[]; members: RepeatedMember[]; box: Box };
export type RepeatedElementsCandidate = {
  id: string;
  slideIndex: number;
  kind: 'native-groups' | 'loose-elements';
  axis: Axis;
  items: RepeatedItem[];
};
type LayoutIssue =
  | { code: 'OUT_OF_BOUNDS'; itemIndex: number }
  | { code: 'ITEM_OVERLAP'; itemIndex: number; otherItemIndex: number }
  | { code: 'NEIGHBOR_OVERLAP'; itemIndex: number; key: string }
  | { code: 'NEIGHBOR_GEOMETRY_UNAVAILABLE'; key: string };
export type RepeatedElementsPreview = {
  count: number;
  mode: ReturnType<typeof planDynamicListLayout>['mode'];
  slots: { sourceIndex: number; box: Box }[];
  fits: boolean;
  issues: LayoutIssue[];
};

const MAX_PREVIEW_ITEMS = 100;
const EPSILON = 0.25;
const right = (box: Box) => box.x + box.width;
const bottom = (box: Box) => box.y + box.height;
const centerX = (box: Box) => box.x + box.width / 2;
const centerY = (box: Box) => box.y + box.height / 2;
const dimensionsSimilar = (a: Box, b: Box) =>
  Math.abs(a.width - b.width) <= Math.max(1, a.width * .04) &&
  Math.abs(a.height - b.height) <= Math.max(1, a.height * .04);
const inside = (child: Box, outer: Box) => child.x >= outer.x - EPSILON && child.y >= outer.y - EPSILON &&
  right(child) <= right(outer) + EPSILON && bottom(child) <= bottom(outer) + EPSILON;
const overlaps = (a: Box, b: Box) => Math.min(right(a), right(b)) - Math.max(a.x, b.x) > EPSILON &&
  Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y) > EPSILON;

function bounds(boxes: Box[]): Box {
  const x = Math.min(...boxes.map(box => box.x));
  const y = Math.min(...boxes.map(box => box.y));
  return { x, y, width: Math.max(...boxes.map(right)) - x, height: Math.max(...boxes.map(bottom)) - y };
}

function validBox(box: Box | null): box is Box {
  return !!box && [box.x, box.y, box.width, box.height].every(Number.isFinite) && box.width >= 0 && box.height >= 0;
}

function pageBox(node: SourceNode, nodes: SourceNode[], patches: Patches): Box | null {
  const box = boxFor(node, patches);
  if (!validBox(box)) return null;
  return transformedBox(box, worldFrame(node, nodes, patches));
}

function transformedBox(box: Box, matrix: ReturnType<typeof frame>): Box | null {
  const result = bounds([point(matrix, 0, 0), point(matrix, box.width, 0), point(matrix, 0, box.height),
    point(matrix, box.width, box.height)].map(position => ({ ...position, width: 0, height: 0 })));
  return validBox(result) ? result : null;
}

function renderBox(node: SourceNode, element: RenderElement | undefined): Box | null {
  if (!element) return null;
  const box = { x: element.left, y: element.top, width: element.width, height: element.height };
  if (!validBox(box)) return null;
  return transformedBox(box, frame({ ...node, rotation: element.rotate ?? 0, flipH: !!element.isFlipH, flipV: !!element.isFlipV }, box));
}

function role(node: SourceNode, patches: Patches): string {
  if (node.hasImage || node.kind === 'pic') return 'picture';
  const text = (patches[node.key]?.text ?? node.text).trim();
  if (node.kind === 'sp' && /^\d{1,3}$/.test(text)) return 'numeric-text';
  if (node.kind === 'sp' && text) return 'text';
  return `${node.kind}:${node.geometry?.preset ?? ''}`;
}

function isAtomic(node: SourceNode) {
  return !node.children.length && (node.kind === 'sp' || node.kind === 'pic');
}

function pageSize(model: LoadedTemplate): Box {
  const { width, height } = model.deck.size;
  return { x: 0, y: 0, width, height };
}

function matchMembers(a: RepeatedItem, b: RepeatedItem): RepeatedMember[] | null {
  if (!dimensionsSimilar(a.box, b.box) || a.members.length !== b.members.length) return null;
  const unmatched = [...b.members];
  const ordered: RepeatedMember[] = [];
  for (const member of a.members) {
    const matches = unmatched.filter(other => member.role === other.role && dimensionsSimilar(member.box, other.box) &&
      Math.abs(member.box.x - a.box.x - (other.box.x - b.box.x)) <= Math.max(1, a.box.width * .04) &&
      Math.abs(member.box.y - a.box.y - (other.box.y - b.box.y)) <= Math.max(1, a.box.height * .04));
    if (matches.length !== 1) return null;
    ordered.push(matches[0]);
    unmatched.splice(unmatched.indexOf(matches[0]), 1);
  }
  return ordered;
}

function inferAxis(items: readonly { box: Box }[]): Axis {
  const xs = items.map(item => centerX(item.box));
  const ys = items.map(item => centerY(item.box));
  return Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? 'row' : 'column';
}

function repeatedRuns(items: RepeatedItem[]): RepeatedItem[][] {
  const sets = new Map<string, RepeatedItem[]>();
  for (const axis of ['row', 'column'] as const) {
    const primary = axis === 'row' ? centerX : centerY;
    const cross = axis === 'row' ? centerY : centerX;
    const crossSize = axis === 'row' ? 'height' : 'width';
    for (const [index, first] of items.entries()) {
      const run = [first, ...items.slice(index + 1).flatMap(item => {
        if (Math.abs(cross(item.box) - cross(first.box)) > Math.max(2, first.box[crossSize] * .1)) return [];
        const members = matchMembers(first, item);
        return members ? [{ ...item, members }] : [];
      })].sort((a, b) => primary(a.box) - primary(b.box));
      if (run.length < 2 || axis !== inferAxis(run)) continue;
      if (run.slice(1).some((item, i) => overlaps(run[i].box, item.box))) continue;
      const keys = run.flatMap(item => item.rootKeys).sort();
      sets.set(JSON.stringify(keys), run);
    }
  }
  return [...sets.values()].sort((a, b) => b.length - a.length);
}

function joinCompanionRuns(runs: RepeatedItem[][], sourceOrder: Map<string, number>): RepeatedItem[][] {
  const joined = new Map<string, RepeatedItem[]>();
  for (const run of runs) {
    const axis = inferAxis(run);
    const cross = axis === 'row' ? 'y' : 'x';
    const crossSize = axis === 'row' ? 'height' : 'width';
    const primary = axis === 'row' ? 'x' : 'y';
    const primarySize = axis === 'row' ? 'width' : 'height';
    const companions = runs.filter(other => other !== run && other.length === run.length && inferAxis(other) === axis &&
      !matchMembers(run[0], other[0]));
    let combined = run;
    for (const other of companions) {
      const existing = new Set(combined.flatMap(item => item.rootKeys));
      if (other.some(item => item.rootKeys.some(key => existing.has(key)))) continue;
      const offsetX = other[0].box.x - run[0].box.x;
      const offsetY = other[0].box.y - run[0].box.y;
      const aligned = other.every((item, index) => {
        const original = run[index].box;
        const current = combined[index].box;
        const box = item.box;
        const separation = Math.max(0, box[cross] - current[cross] - current[crossSize], current[cross] - box[cross] - box[crossSize]);
        const primaryIntersection = Math.min(box[primary] + box[primarySize], original[primary] + original[primarySize]) -
          Math.max(box[primary], original[primary]);
        return Math.abs(box.x - original.x - offsetX) <= 2 && Math.abs(box.y - original.y - offsetY) <= 2 &&
          separation <= Math.max(12, Math.min(30, Math.min(current[crossSize], box[crossSize]) * .75)) &&
          primaryIntersection >= Math.min(box[primarySize], original[primarySize]) / 2;
      });
      if (!aligned) continue;
      const merged = combined.map((item, i) => ({
        rootKeys: [...item.rootKeys, ...other[i].rootKeys].sort((a, b) => (sourceOrder.get(a) ?? 0) - (sourceOrder.get(b) ?? 0)),
        members: [...item.members, ...other[i].members],
        box: bounds([item.box, other[i].box]),
      }));
      if (!merged.slice(1).some((item, i) => overlaps(merged[i].box, item.box))) combined = merged;
    }
    if (combined !== run) joined.set(JSON.stringify(combined.flatMap(item => item.rootKeys)), combined);
  }
  return [...joined.values()].sort((a, b) => b.length * b[0].members.length - a.length * a[0].members.length);
}

/** Suggest geometrically repeated items. Semantic equivalence and editability remain proposal decisions. */
export function discoverRepeatedElements(model: LoadedTemplate, slideIndex: number, patches: Patches): RepeatedElementsCandidate[] {
  const slide = model.slides[slideIndex];
  if (!slide) throw new Error('REPEATED_ELEMENTS_SLIDE');
  const { nodes } = slide;
  const occupied = new Set(slideLists(nodes, patches).flatMap(list => list.items.flatMap(item => item.nodes.map(node => node.key))));
  const size = pageSize(model);
  const members = new Map<string, RepeatedMember>();
  const children = new Map<string, SourceNode[]>();
  const loose: RepeatedItem[] = [];
  const native: RepeatedItem[] = [];
  for (const node of nodes) {
    if (!node.parentId) continue;
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }
  for (const node of nodes) {
    if (occupied.has(node.key) || (!isAtomic(node) && node.kind !== 'grpSp')) continue;
    const box = pageBox(node, nodes, patches);
    if (box && (node.parentId ? box.width > 0 || box.height > 0 : box.width >= 1 && box.height >= 1) &&
      inside(box, size) && !inside(size, box)) {
      members.set(node.key, { key: node.key, role: role(node, patches), box });
    }
  }
  for (const node of nodes) {
    const member = members.get(node.key);
    if (!member || node.parentId || node.rotation || node.flipH || node.flipV) continue;
    if (node.kind === 'grpSp') {
      const direct = children.get(node.id) ?? [];
      if (!validBox(node.childBox) || !node.childBox.width || !node.childBox.height || !direct.length ||
        !direct.every(child => isAtomic(child) && members.has(child.key))) continue;
      native.push({ rootKeys: [node.key], box: member.box, members: direct.flatMap(child => members.get(child.key) ?? []) });
    } else {
      const name = patches[node.key]?.name ?? node.name;
      if (!/^(runtime-page-number|@(背景|图表|表格))$/u.test(name.trim())) {
        loose.push({ rootKeys: [node.key], box: member.box, members: [member] });
      }
    }
  }
  if (loose.length + native.length > 1000) throw new Error('REPEATED_ELEMENTS_WORK_LIMIT');
  const cards = loose.flatMap(anchor => {
    const decoration = anchor.members[0];
    if (!decoration.role.startsWith('sp:')) return [];
    const contained = loose.filter(item => item !== anchor && inside(item.box, anchor.box) && !inside(anchor.box, item.box));
    if (!contained.length || !contained.some(item => item.members[0].role === 'text')) return [];
    const included = new Set([decoration.key, ...contained.flatMap(item => item.rootKeys)]);
    const ordered = loose.filter(item => included.has(item.rootKeys[0]));
    return [{ rootKeys: ordered.flatMap(item => item.rootKeys), box: bounds(ordered.map(item => item.box)), members: ordered.flatMap(item => item.members) }];
  });
  const candidateRuns = [
    { kind: 'native-groups', runs: repeatedRuns(native) },
    { kind: 'loose-elements', runs: joinCompanionRuns(repeatedRuns([...cards, ...loose]), new Map(nodes.map((node, i) => [node.key, i]))) },
    { kind: 'loose-elements', runs: repeatedRuns(cards) },
    { kind: 'loose-elements', runs: repeatedRuns(loose) },
  ] as const;
  const candidates: RepeatedElementsCandidate[] = [];
  const claimed = new Set<string>();
  for (const { kind, runs } of candidateRuns) {
    for (const run of runs) {
      const keys = run.flatMap(item => item.rootKeys);
      if (keys.length !== new Set(keys).size || keys.some(key => claimed.has(key))) continue;
      for (const key of keys) claimed.add(key);
      candidates.push({ id: JSON.stringify([slide.path, ...keys]), slideIndex, kind, axis: inferAxis(run), items: run });
    }
  }
  return candidates;
}

function plan(items: readonly { box: Box }[], count: number) {
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_PREVIEW_ITEMS) throw new Error('LIST_COUNT_UNSUPPORTED');
  const toEmu = (value: number) => Math.round(value * EMU_PER_PT);
  const boxes = items.map(({ box }) => ({ x: toEmu(box.x), y: toEmu(box.y), cx: toEmu(box.width), cy: toEmu(box.height) }));
  const axesInEmu = inferAxis(boxes.map(box => ({ box: { x: box.x, y: box.y, width: box.cx, height: box.cy } })));
  const layout = planDynamicListLayout(boxes, count, axesInEmu);
  return {
    count, mode: layout.mode,
    slots: layout.slots.map((box, index) => ({ sourceIndex: layout.sourceIndexes[index], box: {
      x: Math.round(box.x) / EMU_PER_PT, y: Math.round(box.y) / EMU_PER_PT,
      width: Math.round(box.cx) / EMU_PER_PT, height: Math.round(box.cy) / EMU_PER_PT,
    } })),
  };
}

/** Preview existing marks with the same count layout and source ordering as the generator. */
export function previewListLayout(list: SlideList, count: number, patches: Patches = {}) {
  return plan(list.items.map(item => ({ box: list.grouped ? boxFor(item.roots[0], patches) ?? item.box : item.box })), count);
}

function currentCandidate(model: LoadedTemplate, patches: Patches, candidate: Pick<RepeatedElementsCandidate, 'id' | 'slideIndex'>) {
  const current = discoverRepeatedElements(model, candidate.slideIndex, patches).find(item => item.id === candidate.id);
  if (!current) throw new Error('REPEATED_ELEMENTS_STALE_CANDIDATE');
  return current;
}

function checkLayout(model: LoadedTemplate, patches: Patches, candidate: RepeatedElementsCandidate, count: number): RepeatedElementsPreview {
  const layout = plan(candidate.items, count);
  const nodes = model.slides[candidate.slideIndex].nodes;
  const size = pageSize(model);
  const roots = new Set(candidate.items.flatMap(item => item.rootKeys));
  const firstRootIndex = nodes.findIndex(node => roots.has(node.key));
  const rootById = new Map(nodes.filter(node => !node.parentId).map(node => [node.id, node]));
  const ancestors = new Map(nodes.map(node => [node.id, node.parentId]));
  const renderRoots = new Map((model.deck.slides?.[candidate.slideIndex]?.elements ?? []).map(element => [String(element.id), element]));
  const issues: LayoutIssue[] = [];
  const neighbors = nodes.flatMap((node, sourceIndex) => {
    let rootId = node.id;
    for (let parentId = node.parentId; parentId; parentId = ancestors.get(parentId) ?? null) rootId = parentId;
    const root = rootById.get(rootId);
    if (root && roots.has(root.key)) return [];
    const box = pageBox(node, nodes, patches) ?? (!node.parentId ? renderBox(node, renderRoots.get(node.id)) : null);
    if (!box) {
      issues.push({ code: 'NEIGHBOR_GEOMETRY_UNAVAILABLE', key: node.key });
      return [];
    }
    const content = patches[node.key]?.text ?? node.text;
    const underlay = sourceIndex < firstRootIndex && !node.parentId && isAtomic(node) && !content.trim() &&
      candidate.items.every(item => inside(item.box, box));
    // OOXML may encode a line with zero extent on one axis.
    const footprint = {
      x: box.width ? box.x : box.x - .5, y: box.height ? box.y : box.y - .5,
      width: box.width || 1, height: box.height || 1,
    };
    return [{ key: node.key, box: footprint, underlay }];
  });
  const footprints = layout.slots.map(({ box, sourceIndex }) => {
    const source = candidate.items[sourceIndex];
    const sx = box.width / source.box.width;
    const sy = box.height / source.box.height;
    return bounds([box, ...source.members.map(member => ({
      x: box.x + (member.box.x - source.box.x) * sx,
      y: box.y + (member.box.y - source.box.y) * sy,
      width: member.box.width * sx, height: member.box.height * sy,
    }))]);
  });
  for (const [itemIndex, box] of footprints.entries()) {
    if (!inside(box, size)) issues.push({ code: 'OUT_OF_BOUNDS', itemIndex });
    for (let otherItemIndex = itemIndex + 1; otherItemIndex < footprints.length; otherItemIndex++) {
      if (overlaps(box, footprints[otherItemIndex])) issues.push({ code: 'ITEM_OVERLAP', itemIndex, otherItemIndex });
    }
    for (const neighbor of neighbors) {
      if ((!neighbor.underlay || !inside(box, neighbor.box)) && overlaps(box, neighbor.box)) issues.push({ code: 'NEIGHBOR_OVERLAP', itemIndex, key: neighbor.key });
    }
  }
  return { ...layout, fits: issues.length === 0, issues };
}

export function previewRepeatedElements(model: LoadedTemplate, patches: Patches, candidate: Pick<RepeatedElementsCandidate, 'id' | 'slideIndex'>, count: number): RepeatedElementsPreview {
  return checkLayout(model, patches, currentCandidate(model, patches, candidate), count);
}

export function applyRepeatedElements(model: LoadedTemplate, patches: Patches, candidate: Pick<RepeatedElementsCandidate, 'id' | 'slideIndex'>, range: { min: number; max: number }): { patches: Patches; selected: string } {
  const current = currentCandidate(model, patches, candidate);
  if (!range || !Number.isSafeInteger(range.min) || !Number.isSafeInteger(range.max) ||
    range.min < 1 || range.min > current.items.length || range.max < current.items.length || range.max > MAX_PREVIEW_ITEMS) {
    throw new Error('REPEATED_ELEMENTS_RANGE');
  }
  for (let count = range.min; count <= range.max; count++) {
    const checked = checkLayout(model, patches, current, count);
    if (!checked.fits) throw new Error(`REPEATED_ELEMENTS_UNSAFE_LAYOUT: ${count}: ${checked.issues[0].code}`);
  }
  const nodes = model.slides[current.slideIndex].nodes;
  const indexes = slideLists(nodes, patches).map(list => list.index);
  const index = Math.max(0, ...indexes) + 1;
  const nodeByKey = new Map(nodes.map(node => [node.key, node]));
  const components = current.items.map(item => item.members.flatMap(({key}) => {
    const component = parseComponentName(patches[key]?.name ?? nodeByKey.get(key)?.name ?? '');
    return component && ['text','image','icon','number'].includes(component.kind) ? [component] : [];
  }));
  if (components.some(item => !item.length)) throw new Error('REPEATED_ELEMENTS_COMPONENT_MARKS_REQUIRED');
  if (components[0].some(component => component.kind === 'text' && !component.length)) {
    throw new Error('REPEATED_ELEMENTS_FIRST_TEXT_RANGE_REQUIRED');
  }
  const items = current.items.map((item, i) => {
    const roots = item.rootKeys.map(key => {
      const node = nodeByKey.get(key);
      if (!node) throw new Error('REPEATED_ELEMENTS_STALE_CANDIDATE');
      return node;
    });
    return { index: i + 1, roots, nodes: roots, box: item.box };
  });
  const first = items[0].roots[0];
  let result = { patches: { ...patches }, selected: first.key };
  if (current.kind === 'loose-elements') {
    result = editListMembers(model, current.slideIndex, {
      index, items, key: `${first.slidePath}:list:${index}`, color: '', controller: first,
      dynamic: true, grouped: false, ...range, box: bounds(items.map(item => item.box)),
    }, 1, current.items[0].rootKeys, patches);
  } else {
    for (const item of items) {
      const key = item.roots[0].key;
      result.patches[key] = { ...result.patches[key], name: `@${index}@${item.index}` };
    }
  }
  result.patches[result.selected] = { ...result.patches[result.selected], name: `@${index}@1[${range.min}-${range.max}]` };
  return result;
}
