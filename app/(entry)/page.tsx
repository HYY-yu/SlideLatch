// The static host sends the HTTP redirect; this fallback also works in local Next.js.
export default function EntryPage() {
  return <><meta httpEquiv="refresh" content="0;url=/zh"/><a href="/zh">SlideLatch</a></>;
}
