/**
 * Only the newest request may land. start() returns a check that stays true until a later start()
 * or cancel(); a slow older response is then dropped instead of overwriting newer state (for example
 * a member's slate resolving after the user signed out).
 */
export function latestRequest() {
  let current = 0;
  return {
    start() {
      const id = ++current;
      return () => id === current;
    },
    cancel() {
      current++;
    },
  };
}
