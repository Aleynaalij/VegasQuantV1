import { supabase } from "./supabase";

/**
 * Calls `fn` only when the signed-in account changes (sign in as someone else, sign out).
 * Supabase also emits INITIAL_SESSION on subscribe, SIGNED_IN whenever the app returns to the
 * foreground and TOKEN_REFRESHED hourly; for the same account those change nothing, and clearing
 * a page and refetching on each one made the app flash and freeze.
 */
export function onUserChange(fn: (userId: string | null) => void) {
  let current: string | null | undefined;
  void supabase.auth.getSession().then((r) => {
    if (current === undefined) current = r.data.session?.user.id ?? null;
  });
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    const id = session?.user.id ?? null;
    if (current === undefined) {
      current = id;
      return;
    }
    if (id === current) return;
    current = id;
    fn(id);
  });
  return () => data.subscription.unsubscribe();
}
