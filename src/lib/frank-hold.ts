/**
 * Holds the NHL sport chip back until Frank's surprise status is known (owner, Oct 31): NHL arriving
 * is the surprise, so he must not see or tap it before the invitation. For everyone else the hold
 * lasts one status read; it always lifts on sign-out, an error or a timeout.
 */
type Listener = () => void;
let held = true;
const listeners = new Set<Listener>();

export const nhlHeld = () => held;
export function setNhlHeld(next: boolean) {
  if (held === next) return;
  held = next;
  listeners.forEach((l) => l());
}
export function subscribeNhlHold(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
