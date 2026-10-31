type ShortcutEvent = { key:string; ctrlKey:boolean; metaKey:boolean; shiftKey:boolean; altKey:boolean; isComposing:boolean };
export function historyShortcut(event: ShortcutEvent): 'undo' | 'redo' | null {
  if (event.isComposing || event.altKey || (!event.ctrlKey && !event.metaKey)) return null;
  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && event.ctrlKey && !event.metaKey && !event.shiftKey) return 'redo';
  return null;
}
