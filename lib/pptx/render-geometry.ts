import type { SourceNode } from './types';

/** pptxtojson returns percentage strings, while some callers use normalized numbers. */
export function gradientOffset(value: string | number): number {
  const number = typeof value === 'string' && value.endsWith('%') ? Number.parseFloat(value) / 100 : Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

/** DrawingML trapezoid guides use the shorter side, with adjustment capped by width. */
export function presetPath(geometry: SourceNode['geometry'], width: number, height: number): string | null {
  if (geometry?.preset !== 'trapezoid') return null;
  const adjustment = geometry.adjustments.adj ?? 25000;
  const inset = Math.max(0, Math.min(width / 2, Math.min(width, height) * adjustment / 100000));
  return `M ${inset} 0 L ${width - inset} 0 L ${width} ${height} L 0 ${height} Z`;
}
