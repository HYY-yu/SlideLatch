export type TextOutline = {
  width: number;
  color: string;
  removeFill: boolean;
  mask?: string;
};
export type TextOutlineParagraph = {
  index: number;
  runs: { text: string; outline?: TextOutline }[];
};

function drawingChild(node: Element | undefined, name: string) {
  return node && Array.from(node.childNodes).find((item): item is Element =>
    item.nodeType === 1 && 'localName' in item && item.localName === name);
}

function boundedNumber(value: string | null | undefined, min: number, max: number) {
  if (!value || !/^-?\d+(?:\.\d+)?$/.test(value)) return;
  const number = Number(value);
  if (number >= min && number <= max) return number;
}

function sourceColor(node: Element, schemeColor: (name: string) => string | undefined) {
  const rgb = drawingChild(node, 'srgbClr');
  const scheme = drawingChild(node, 'schemeClr');
  const raw = rgb?.getAttribute('val') ?? schemeColor(scheme?.getAttribute('val') ?? '');
  if (!raw || !/^[0-9a-f]{6}$/i.test(raw)) return;
  const alpha = boundedNumber(drawingChild(rgb ?? scheme, 'alpha')?.getAttribute('val'), 0, 100000) ?? 100000;
  return { rgb: raw, alpha: alpha / 100000 };
}

function runOutline(properties: Element | undefined, schemeColor: (name: string) => string | undefined): TextOutline | undefined {
  const line = drawingChild(properties, 'ln');
  if (!line) return;
  const width = (boundedNumber(line.getAttribute('w'), 0, 20116800) ?? 12700) / 12700;
  if (!width) return;
  const removeFill = !!drawingChild(properties, 'noFill');
  const solid = drawingChild(line, 'solidFill');
  if (solid) {
    const paint = sourceColor(solid, schemeColor);
    if (paint && paint.alpha > 0) {
      const alpha = Math.round(paint.alpha * 255).toString(16).padStart(2, '0');
      return { width, removeFill, color: `#${paint.rgb}${alpha}` };
    }
    return;
  }
  const gradient = drawingChild(line, 'gradFill');
  const list = drawingChild(gradient, 'gsLst');
  if (!list) return;
  const stops = Array.from(list.children).flatMap(stop => {
    const paint = sourceColor(stop, schemeColor);
    const position = boundedNumber(stop.getAttribute('pos'), 0, 100000);
    return paint && position !== undefined ? [{ ...paint, position: position / 1000 }] : [];
  }).sort((a, b) => a.position - b.position);
  const visible = stops.find(stop => stop.alpha > 0);
  if (!visible) return;
  const angle = (boundedNumber(drawingChild(gradient, 'lin')?.getAttribute('ang'), 0, 21600000) ?? 0) / 60000 + 90;
  const mask = removeFill && stops.length > 1 && stops.some(stop => stop.alpha !== 1)
    ? `linear-gradient(${angle}deg, ${stops.map(stop => `rgba(0, 0, 0, ${stop.alpha}) ${stop.position}%`).join(', ')})`
    : undefined;
  return { width, removeFill, color: `#${visible.rgb}`, mask };
}

export function readTextOutlines(shape: Element, schemeColor: (name: string) => string | undefined): TextOutlineParagraph[] {
  const body = drawingChild(shape, 'txBody');
  if (!body) return [];
  return Array.from(body.children).filter(node => node.localName === 'p').flatMap((paragraph, index) => {
    const runs = Array.from(paragraph.children).filter(node => node.localName === 'r' || node.localName === 'fld').map(run => ({
      text: drawingChild(run, 't')?.textContent ?? '',
      outline: runOutline(drawingChild(run, 'rPr'), schemeColor),
    }));
    return runs.some(run => run.outline) ? [{ index, runs }] : [];
  });
}
