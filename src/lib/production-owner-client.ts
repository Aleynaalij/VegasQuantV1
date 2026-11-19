/** Account/token changes invalidate every outstanding UI-selection request. */
export function createOwnerPreviewSelection(
  render: (enabled: boolean) => void,
  request: typeof fetch = fetch,
) {
  let generation = 0,
    active = true;
  return {
    async check(token: string | null, invalidate = true) {
      if (!active) return;
      const own = ++generation;
      if (invalidate) render(false);
      if (!token) return;
      try {
        const result = await request("/api/consumer/owner-preview", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          credentials: "omit",
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(6000),
        });
        const body = result.ok ? await result.json() : null;
        if (active && own === generation) render(body?.enabled === true);
      } catch {
        if (active && own === generation) render(false);
      }
    },
    dispose() {
      active = false;
      ++generation;
    },
  };
}
