/** Reuse the existing query builder, with credentials stripped at the browser boundary. */
export function stageDataFetch(
  origin: string,
  transport: typeof fetch = fetch,
): typeof fetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    if (url.origin !== origin || !url.pathname.startsWith("/rest/v1/"))
      return Response.json(
        {
          code: "VQ_STAGE_UNAVAILABLE",
          message: "This service has no verified isolated staging contract.",
        },
        { status: 503 },
      );
    const h = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    const path = url.pathname.slice("/rest/v1/".length);
    const legacy = [
      "rpc/age_verification_status",
      "rpc/membership_status",
      "rpc/sports_slate",
      "rpc/game_zone_posts",
    ].includes(path);
    return transport("/staging/discovery/data", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      signal: init?.signal,
      body: JSON.stringify({
        path,
        ...(!legacy
          ? {
              prefer: h.get("prefer"),
              request_id: method === "GET" ? null : crypto.randomUUID(),
            }
          : {}),
        query: url.search,
        method,
        accept: h.get("accept"),
        body: typeof init?.body === "string" ? init.body : null,
      }),
    });
  };
}
