import { markName, parseMark, type Mark } from './dsl.ts';
import type { Patches, SourceNode } from './types';

export type MarkType = Exclude<Mark['type'], 'fixed' | 'raw'>;
/** Object capabilities come from OOXML, independently of possibly incorrect AI tags. */
export function allowedMarkTypes(node: SourceNode): MarkType[] {
  if (node.kind === 'grpSp') return ['group'];
  if (node.kind === 'graphicFrame') return node.dataKind ? [node.dataKind] : [];
  if (node.hasImage || node.kind === 'pic') return ['image', 'icon', ...(node.parentId ? [] : ['background'] as const)];
  if (node.hasTextBody || node.text) return ['text', 'number'];
  return [];
}
export function removedMarkName(node: SourceNode): string {
  return node.name.trim().startsWith('@') ? `Object ${node.id}` : node.name;
}
export function addedMarkName(node: SourceNode, nodes: SourceNode[], patches: Patches): string | null {
  const type = allowedMarkTypes(node)[0];
  if (!type) return null;
  const existing = nodes.map(n => parseMark(patches[n.key]?.name ?? n.name));
  const mark = {...parseMark(''), type};
  if (type === 'image') mark.index = Math.max(0, ...existing.filter(m => m.type === 'image').map(m => m.index)) + 1;
  if (type === 'group') mark.index = Math.max(0, ...existing.filter(m => m.type === 'group').map(m => m.index)) + 1;
  return markName(mark, node.name, node.kind === 'grpSp');
}
