/** Which tab sits under the finger: the tab whose span holds x, clamped to the first/last tab. */
export function scrubIndex(x: number, spans: { left: number; right: number }[]): number {
  if (!spans.length) return -1;
  if (x < spans[0].left) return 0;
  const i = spans.findIndex((s) => x >= s.left && x < s.right);
  return i < 0 ? spans.length - 1 : i;
}

/** A slide starts once the finger travels this far sideways; shorter moves stay taps. */
export const SCRUB_START_PX = 10;
