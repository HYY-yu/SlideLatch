export type BrowserPackageEntry = {path: string; uncompressedBytes: number};
export type BrowserPackageBudget = {parts: number; partBytes: number; totalBytes: number; xmlPartBytes: number; xmlTotalBytes: number};
export const BROWSER_PACKAGE_BUDGET: Readonly<BrowserPackageBudget> = Object.freeze({
  parts: 5000,
  partBytes: 100 * 1024 * 1024,
  totalBytes: 200 * 1024 * 1024,
  xmlPartBytes: 20 * 1024 * 1024,
  xmlTotalBytes: 80 * 1024 * 1024,
});
/** Check central-directory metadata before inflating any XML or media. Injectable bounds keep tests small. */
export function assertBrowserPackageBudget(entries: BrowserPackageEntry[], limits: BrowserPackageBudget = BROWSER_PACKAGE_BUDGET): void {
  if (entries.length > limits.parts) throw new Error('BROWSER_PACKAGE_TOO_MANY_PARTS');
  let total = 0, xml = 0;
  for (const entry of entries) {
    const bytes = entry.uncompressedBytes;
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error(`BROWSER_PACKAGE_SIZE_METADATA: ${entry.path}`);
    if (bytes > limits.partBytes) throw new Error(`BROWSER_PACKAGE_PART_TOO_LARGE: ${entry.path}`);
    total += bytes;
    if (total > limits.totalBytes) throw new Error('BROWSER_PACKAGE_TOTAL_TOO_LARGE');
    if (/\.(xml|rels)$/.test(entry.path)) {
      if (bytes > limits.xmlPartBytes) throw new Error(`BROWSER_PACKAGE_XML_PART_TOO_LARGE: ${entry.path}`);
      xml += bytes;
      if (xml > limits.xmlTotalBytes) throw new Error('BROWSER_PACKAGE_XML_TOO_LARGE');
    }
  }
}
