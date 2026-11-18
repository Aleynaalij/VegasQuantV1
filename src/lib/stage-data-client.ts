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
    return transport("/staging/discovery/data", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      signal: init?.signal,
      body: JSON.stringify({
        path: url.pathname.slice("/rest/v1/".length),
        query: url.search,
        method,
        accept: h.get("accept"),
        body: typeof init?.body === "string" ? init.body : null,
      }),
    });
  };
}
