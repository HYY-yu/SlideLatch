import type { SourceNode } from './types';

/** pptxtojson returns percentage strings, while some callers use normalized numbers. */
export function gradientOffset(value: string | number): number {
  const number = typeof value === 'string' && value.endsWith('%') ? Number.parseFloat(value) / 100 : Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

export function presetPath(geometry: SourceNode['geometry'], width: number, height: number): string | null {
  if (!geometry) return null;
  const { preset, adjustments } = geometry;
  const shortSide = Math.min(width, height);

  if (preset === 'trapezoid') {
    const adjustment = adjustments.adj ?? 25000;
    const inset = Math.max(0, Math.min(width / 2, shortSide * adjustment / 100000));
    return `M ${inset} 0 L ${width - inset} 0 L ${width} ${height} L 0 ${height} Z`;
  }
  if (preset !== 'roundRect' && preset !== 'round2SameRect') return null;

  // DrawingML uses the shorter side for both components of the circular radius.
  const radius = (adjustment: number) => shortSide * Math.max(0, Math.min(50000, adjustment)) / 100000;
  const top = radius((preset === 'roundRect' ? adjustments.adj : adjustments.adj1) ?? 16667);
  const bottom = preset === 'roundRect' ? top : radius(adjustments.adj2 ?? 0);

  const path = [`M ${top} 0 L ${width - top} 0`];
  if (top) path.push(`A ${top} ${top} 0 0 1 ${width} ${top}`);
  path.push(`L ${width} ${height - bottom}`);
  if (bottom) path.push(`A ${bottom} ${bottom} 0 0 1 ${width - bottom} ${height}`);
  path.push(`L ${bottom} ${height}`);
  if (bottom) path.push(`A ${bottom} ${bottom} 0 0 1 0 ${height - bottom}`);
  path.push(`L 0 ${top}`);
  if (top) path.push(`A ${top} ${top} 0 0 1 ${top} 0`);
  return path.join(' ') + ' Z';
}

export function tableRowHeights(source: readonly number[], rowCount: number, frameHeight: number): number[] {
  if (!rowCount) return [];

  const rows = Array.from({ length: rowCount }, (_, i) => {
    const value = source[i];
    return Number.isFinite(value) && value > 0 ? value : 0;
  });
  const fixedTotal = rows.reduce((sum, value) => sum + value, 0);
  const automaticCount = rows.filter(value => value === 0).length;
  if (!fixedTotal) return rows.map(() => frameHeight / rowCount);

  // Zero-height DrawingML rows are automatic. Leave them room even if explicit rows fill the frame.
  const remaining = frameHeight - fixedTotal;
  const automaticHeight = automaticCount
    ? remaining > 0 ? remaining / automaticCount : frameHeight / rowCount
    : 0;
  const fixedScale = (frameHeight - automaticHeight * automaticCount) / fixedTotal;
  return rows.map(value => value ? value * fixedScale : automaticHeight);
}
