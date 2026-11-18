import "./atlas-base-fetch.mjs";
const baseline = globalThis.fetch;
// Original baseline transport still refuses every non-local, non-isolated destination.
globalThis.fetch = async (input, options) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin === process.env.NEXT_PUBLIC_SUPABASE_URL) {
    if (url.pathname === "/auth/v1/logout") {
      const mode = await baseline(
        `http://127.0.0.1:${process.env.ATLAS_FEATURE_PORT || 3221}/fixture/logout-mode`,
        { headers: { authorization: "Bearer fixture.owner.token" } },
      );
      if ((await mode.json()).fail) return new Response(null, { status: 503 });
    }
    if (
      url.pathname === "/auth/v1/user" &&
      new Headers(options?.headers).get("authorization") ===
        "Bearer fixture.owner.token"
    )
      return Response.json({
        id: "00000000-0000-4000-8000-000000000001",
        email: "synthetic-1@example.test",
        email_confirmed_at: "2026-11-01T12:00:00Z",
        user_metadata: {},
        app_metadata: { provider: "email" },
      });
    if (
      [
        "/rest/v1/rpc/vq_private_access_stage_features",
        "/rest/v1/rpc/vq_private_access_stage_feature",
      ].includes(url.pathname)
    )
      return baseline(
        `http://127.0.0.1:${process.env.ATLAS_FEATURE_PORT || 3221}${url.pathname}`,
        options,
      );
  }
  return baseline(input, options);
};
