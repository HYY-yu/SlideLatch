/** Collapse repeated placeholder phrases (including a truncated last repeat), preserving real words. */
export function uniqueNodeContent(text: string): string {
  const chars = Array.from(text.trim());
  if (!chars.length) return '';
  const prefix = new Array<number>(chars.length).fill(0);
  for (let i = 1; i < chars.length; i++) {
    let j = prefix[i - 1];
    while (j > 0 && chars[i] !== chars[j]) j = prefix[j - 1];
    if (chars[i] === chars[j]) j++;
    prefix[i] = j;
  }
  const period = chars.length - prefix[chars.length - 1];
  return period <= chars.length / 2 ? chars.slice(0, period).join('') : chars.join('');
}

export function previewText(content: string, count: number): string {
  const chars = Array.from(content);
  if (!chars.length || count <= 0 || !Number.isSafeInteger(count)) return '';
  // Only the visible prefix is needed for clipped SVG text. This is not a DSL length limit.
  const visibleCount = Math.min(count, 100000);
  const phrase = chars.join('');
  return phrase.repeat(Math.floor(visibleCount / chars.length)) + chars.slice(0, visibleCount % chars.length).join('');
}
