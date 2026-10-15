/** Deliberate horizontal gesture; vertical scrolling and slow drags are not navigation. */
export function swipeStep(dx: number, dy: number, elapsed: number): -1 | 0 | 1 {
  if (elapsed > 800 || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return 0;
  return dx < 0 ? 1 : -1;
}
