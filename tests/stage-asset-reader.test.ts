import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { stageMatchupSheet } from "../src/lib/stage-matchup-sheet";
import { stageDataGateway } from "../src/lib/stage-data-gateway";
import { noFeatures, FEATURE_CONTRACT } from "../src/lib/stage-feature-query";
const env = {
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_TARGET_ENV: "atlas-private-access",
  VERCEL_URL: "atlas-review.vercel.app",
  VQ_PRIVATE_ACCESS_PROJECT_REF: "caynldluziwrzmvuslzg",
  VQ_STAGE_BUILD_PROFILE: "combined",
  NEXT_PUBLIC_SUPABASE_URL: "https://caynldluziwrzmvuslzg.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
  BILLING_ENABLED: "false",
  LIVE_SCORES_DISABLED: "1",
  AGE_VERIFICATION_ENABLED: "false",
  VQ_PUBLICATION_PREVIEW_LIVE_ENABLED: "false",
  STAGING_DISCOVERY_PROJECT: "caynldluziwrzmvuslzg",
  STAGING_DISCOVERY_ENABLED: "true",
  STAGING_DISCOVERY_FIXTURES: "true",
  STAGING_DISCOVERY_LINKED_PUBLICATIONS: "false",
  CONSUMER_UI_ENABLED: "true",
  VQ_STAGE_FEATURE_CONTRACT: FEATURE_CONTRACT,
};
const id = "00000000-0000-4000-8000-000000000001";
test("feature HTTP and original asset adapter preserve same-session eligibility, CSRF, final revocation and no production fallback", async (t) => {
  const previous = { ...process.env };
  Object.assign(process.env, env);
  t.after(() => {
    for (const k of Object.keys(process.env))
      if (!(k in previous)) delete process.env[k];
    Object.assign(process.env, previous);
  });
  let allowed = true,
    age = true,
    member = true,
    version = FEATURE_CONTRACT,
    rendered = 0,
    race = false;
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, env.NEXT_PUBLIC_SUPABASE_URL);
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer owner.synthetic.token",
    );
    if (url.pathname.endsWith("vq_private_access_stage_authorized"))
      return Response.json(allowed);
    if (url.pathname.endsWith("age_verification_status"))
      return Response.json({ synthetic: true, verified: age });
    if (url.pathname.endsWith("membership_status"))
      return Response.json({ allowed: member });
    if (url.pathname.endsWith("vq_private_access_stage_features"))
      return Response.json(
        allowed && age && member
          ? {
              contract: version,
              capabilities: { ...noFeatures, social: true, research: true },
            }
          : null,
      );
    if (url.pathname.endsWith("vq_private_access_stage_feature")) {
      const p = JSON.parse(String(init?.body)).p;
      assert.equal(p.name, "community_post");
      assert.equal(p.args.p_id, id);
      if (race) age = false;
      return Response.json({
        status: 200,
        data: { id, body: "Synthetic authorized projection" },
      });
    }
    throw Error("Unreviewed transport");
  };
  const request = (
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    new NextRequest(
      `https://atlas-review.vercel.app/staging/discovery/${path}`,
      {
        method: body ? "POST" : "GET",
        headers: {
          cookie: "__Host-vq-private-access=owner.synthetic.token",
          origin: "https://atlas-review.vercel.app",
          "content-type": "application/json",
          ...headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
  const renderer = async (req: Request) => {
    rendered++;
    assert.equal(
      req.headers.get("authorization"),
      "Bearer owner.synthetic.token",
    );
    if (race) age = false;
    return Response.json({
      svg: "<svg/>",
      publishedAt: "2026-11-01T12:00:00Z",
      evidence: "synthetic renderer test",
    });
  };
  const render = () =>
    stageMatchupSheet(
      request(`read/matchup-sheet/${id}`),
      { params: Promise.resolve({ id }) },
      transport,
      renderer,
    );
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(await response.text(), /2026-11-01/);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  const query = {
    path: "rpc/community_post",
    query: "",
    method: "POST",
    body: JSON.stringify({ p_id: id }),
    accept: "application/json",
    prefer: null,
    request_id: id,
  };
  assert.equal(
    (await stageDataGateway(request("data", query), transport)).status,
    200,
  );
  race = true;
  assert.equal(
    (await stageDataGateway(request("data", query), transport)).status,
    403,
  );
  age = true;
  assert.equal((await render()).status, 403);
  age = true;
  race = false;
  version = "malformed";
  assert.equal((await render()).status, 503);
  assert.equal(
    (await stageDataGateway(request("data", query), transport)).status,
    503,
  );
  version = FEATURE_CONTRACT;
  for (const deny of ["gate", "age", "member"]) {
    allowed = deny !== "gate";
    age = deny !== "age";
    member = deny !== "member";
    assert.notEqual((await render()).status, 200);
    assert.notEqual(
      (await stageDataGateway(request("data", query), transport)).status,
      200,
    );
  }
  allowed = age = member = true;
  assert.equal(
    (
      await stageDataGateway(
        request("data", query, { origin: "https://attacker.example" }),
        transport,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await stageMatchupSheet(
        request(`read/matchup-sheet/${id}`, undefined, {
          authorization: "Bearer conflicting",
        }),
        { params: Promise.resolve({ id }) },
        transport,
        renderer,
      )
    ).status,
    400,
  );
  const before = rendered;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  assert.equal((await render()).status, 404);
  assert.equal(rendered, before);
});
