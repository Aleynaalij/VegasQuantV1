// Standalone process: environment is set before the server modules capture their config.
// Uses the ORIGINAL renderer and canonical publication checks, never a replacement SVG.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
const url = "https://caynldluziwrzmvuslzg.supabase.co";
const game = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "ny-cle-20261109",
  provider_id: "123456789",
  away_team: "New York Knicks",
  home_team: "Cleveland Cavaliers",
  away_abbreviation: "NY",
  home_abbreviation: "CLE",
  tipoff: "2026-11-10T00:00:00Z",
  tipoff_tbd: false,
  venue: "Synthetic arena",
  season: 2027,
  season_type: 2,
  status: "STATUS_SCHEDULED",
  away_score: null,
  home_score: null,
};
const hash = createHash("md5")
  .update(`nba-matchup-cheat-sheet:2026-11-09:${game.id}`)
  .digest("hex");
const id = hash.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
const post = {
  id,
  title: `NBA Matchup Cheat Sheet · ${game.away_team} @ ${game.home_team}`,
  card: "vq-publication:v1",
  sport: "nba",
  legs: [],
  created_at: "2026-11-09T20:44:00Z",
  body: "Research only. Synthetic fixture.\nhttps://vegasquant.app/nba/games/ny-cle-20261109\nAVAILABILITY · NBA 3:30 PM ET REPORT\nSynthetic report wording.\nhttps://ak-static.cms.nba.com/referee/injury/Injury-Report_2026-11-09_03_30PM.pdf",
};
let allowed = true,
  age = true,
  member = true,
  wrongTitle = false;
let calls = 0;
globalThis.fetch = async (input, init) => {
  const u = new URL(input instanceof Request ? input.url : String(input));
  assert.equal(
    u.origin,
    url,
    "no production or optional external logo request",
  );
  assert.equal(
    new Headers(input instanceof Request ? input.headers : init?.headers).get(
      "authorization",
    ),
    "Bearer synthetic.asset.token",
  );
  calls++;
  const name = u.pathname.split("/").pop();
  if (name === "vq_private_access_stage_authorized")
    return Response.json(allowed);
  if (name === "vq_private_access_stage_features")
    return Response.json(
      age && member
        ? {
            contract: "vq-stage-features-v1",
            capabilities: {
              social: false,
              profile: false,
              desk: false,
              notifications: false,
              research: true,
            },
          }
        : null,
    );
  if (u.pathname === "/auth/v1/user")
    return Response.json({
      id: game.id,
      email_confirmed_at: "2026-01-01T00:00:00Z",
    });
  if (name === "membership_status") return Response.json({ allowed: member });
  if (name === "age_verification_status")
    return Response.json({ synthetic: true, required: true, verified: age });
  if (name === "community_posts")
    return Response.json([
      { ...post, title: wrongTitle ? "Wrong publication" : post.title },
    ]);
  if (name === "nba_games")
    return Response.json(
      u.searchParams.has("status")
        ? []
        : u.searchParams.get("select") === "slug"
          ? [{ slug: game.slug }]
          : [game],
    );
  if (name === "nba_observations") return Response.json([]);
  throw Error(`Unreviewed request ${u.pathname}`);
};
const { stageMatchupSheet } = await import(
  "../../src/lib/stage-matchup-sheet.ts"
);
const get = () =>
  stageMatchupSheet(
    new NextRequest(
      `https://atlas-review.vercel.app/staging/discovery/read/matchup-sheet/${id}`,
      { headers: { cookie: "__Host-vq-private-access=synthetic.asset.token" } },
    ),
    { params: Promise.resolve({ id }) },
  );
const r = await get();
assert.equal(r.status, 200);
const sheet = await r.json();
assert.match(sheet.svg, /NBA MATCHUP CHEAT SHEET/);
assert.match(sheet.svg, /Synthetic report wording/);
assert(sheet.svg.length > 1000);
assert.equal(sheet.sources[0].href, "/nba/games/ny-cle-20261109");
assert(!JSON.stringify(sheet).includes("synthetic.asset.token"));
wrongTitle = true;
assert.equal((await get()).status, 404);
wrongTitle = false;
age = false;
assert.equal((await get()).status, 503);
age = true;
member = false;
assert.equal((await get()).status, 503);
member = true;
allowed = false;
assert.equal((await get()).status, 403);
assert(calls > 10);
console.log(
  "PASS: original nonempty SVG via the same-session staging adapter; canonical IDs, source text, isolated origin and denial preserved (synthetic).",
);
