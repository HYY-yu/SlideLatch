/** Six vertical pixels per integer; dragging upward increases the value. */
export function scrubbedValue(start:number,deltaY:number):number {
  return Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,start+Math.round(-deltaY/6)));
}
