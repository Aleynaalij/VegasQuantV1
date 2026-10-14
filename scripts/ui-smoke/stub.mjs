// Minimal Supabase stand-in for UI smoke tests. All data is synthetic ("Sample …").
// Usage: node scripts/ui-smoke/stub.mjs  (listens on 127.0.0.1:54321)
import http from "node:http";

const NOW = "2026-10-14T02:00:00Z"; // the smoke test pins the browser clock here
const games = [
  { id: "g1", slug: "sample-sea-den-2026-10-15", slot: "Thursday Night Football", venue: "Sample Field", kickoff: "2026-10-16T00:15:00+00:00", away_team: "Seattle Seahawks", home_team: "Denver Broncos", created_at: NOW },
  { id: "g2", slug: "sample-hou-jax-2026-10-18", slot: "Sunday · 1 PM", venue: "Sample Stadium", kickoff: "2026-10-18T17:00:00+00:00", away_team: "Houston Texans", home_team: "Jacksonville Jaguars", created_at: NOW },
  { id: "g0", slug: "sample-buf-lar-2026-10-12", slot: "Monday Night Football", venue: "Sample Dome", kickoff: "2026-10-13T00:15:00+00:00", away_team: "Buffalo Bills", home_team: "Los Angeles Rams", created_at: NOW },
];
const pick = { id: "p1", game_id: "g0", stage_id: null, analysis_id: "a1", market: "Player Prop", selection: "Sample Player 60+ receiving yards", recommended_line: 59.5, direction: "over", odds: -110, stake_cents: 2000, model_probability: 58, market_probability: 52.4, edge: 5.6, confidence: 6, risk: 4, predicted_close: "-120", best_number: "59.5", bet_grade: "B", fear_index: 3, timing: "Now", why_like: "Sample case.", why_lose: "Sample risk.", playable_number: "64.5", pass_number: "69.5", book: "Sample Book", raw_handoff: "", created_at: "2026-10-12T10:00:00Z" };
const desk = {
  games, challenges: [], stages: [], markets: [], analyses: [], picks: [pick],
  entries: [], closings: [], reviews: [], transactions: [], audit: [],
  results: [{ id: "r1", pick_id: "p1", result: "WIN", away_score: 37, home_score: 34, profit_cents: 1818, bankroll_cents: null, source: "sample", created_at: "2026-10-13T03:10:00Z" }],
  access: { allowed: true, admin: false, member_code: "SAMPLE" }, free_core: true,
};
const leg = (name, market, matchup, extra = {}) => ({ name, team: "Sample", market, matchup, why: "Sample case.", risk: "Sample risk.", next: "Sample next check.", quote: "Analyst target · live odds unavailable", quote_context: "Sample.", sources: [{ url: "https://example.com", label: "Sample source" }], odds: null, pick_of_day: false, fun_play: false, experimental: false, analysis_kind: "QUALITATIVE_EDITORIAL", copy_text: name, gambly_url: "https://example.com", ...extra });
const tnf = "Seattle @ Denver · Oct 15 · 8:15 PM ET", sun = "Houston @ Jacksonville · Oct 18 · 1:00 PM ET";
const releases = [
  { id: "00000000-0000-4000-8000-000000000001", title: "Pick of the Day · Sample Runner 60+ rushing yards", created_at: NOW, expires_at: "2026-10-16T00:15:00Z", candidates: [leg("Sample Runner", "Full game · 60+ rushing yards", tnf, { pick_of_day: true })] },
  { id: "00000000-0000-4000-8000-000000000002", title: "Sample Seahawks–Broncos legs", created_at: NOW, expires_at: "2026-10-16T00:15:00Z", candidates: [leg("Sample Receiver", "Full game · 50+ receiving yards", tnf), leg("Sample Passer", "Full game · 190+ passing yards", tnf, { odds: -150 })] },
  { id: "00000000-0000-4000-8000-000000000003", title: "Sample Texans–Jaguars legs", created_at: NOW, expires_at: "2026-10-18T17:00:00Z", candidates: [leg("Sample Back", "Full game · 50+ rushing yards", sun)] },
];
const posts = [
  { id: "f1", game: { slug: games[0].slug }, game_id: "g1", category: "Injury watch", title: "Sample Seahawks–Broncos injury update", summary: "Sample summary.", matchup: "Seahawks @ Broncos", away_code: "SEA", home_code: "DEN", market_label: "Sample market", why_watch: "Sample.", caution: "Sample.", next_check: "Sample.", source_url: "https://example.com", source_at: NOW, created_at: NOW },
];
const json = (res, body, status = 200) => { res.statusCode = status; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(body)); };
http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "*");
  if (req.method === "OPTIONS") return res.end();
  const u = decodeURIComponent(req.url || "");
  const rpc = (name) => u.startsWith(`/rest/v1/rpc/${name}`);
  if (rpc("desk_data")) return json(res, desk);
  if (rpc("matchup_directory")) return json(res, games.map((game) => ({ game, analysis: null, market: null })));
  if (rpc("public_research_status")) return json(res, { updated_at: NOW, games: [], results: [{ id: "r1", game: "BUF @ LAR", published_at: pick.created_at, selection: pick.selection, odds: -110, result: "WIN", profit_cents: 1818, stake_cents: 2000, closing_recorded: false }] });
  if (rpc("membership_status")) return json(res, { allowed: true, admin: false, member_code: "SAMPLE" });
  if (rpc("age_verification_status")) return json(res, { required: true, verified: true, state: "verified", version: 1, retry_after: null });
  if (rpc("is_admin")) return json(res, false);
  if (rpc("community_feed")) return json(res, [{ id: "c1", user_id: "u2", author_name: "SampleMember", title: "Sample slip", body: "Sample post body.", sport: "nfl", kind: "talk", legs: [], stake: null, created_at: NOW, reactions: 0, reacted: false, comments: 0, following: false }]);
  if (rpc("community_member")) return json(res, { username: "SampleMember", region: "Sample", avatar: null, visible: true, events: [] });
  if (rpc("challenge_community_count")) return json(res, 3);
  if (u.startsWith("/rest/v1/rpc/")) return json(res, null);
  if (u.startsWith("/rest/v1/candidate_releases")) {
    if (u.includes("pick_of_day")) return json(res, releases.slice(0, 1));
    if (u.includes("fun_play") || u.includes("expires_at=lte")) return json(res, []);
    return json(res, releases);
  }
  if (u.startsWith("/rest/v1/research_feed_posts")) return json(res, posts);
  if (u.startsWith("/rest/v1/community_profiles")) { const p = { username: "SampleMember", avatar: null, region: "Sample", visible: true }; return json(res, (req.headers.accept || "").includes("vnd.pgrst.object") ? p : [p]); }
  if (u.startsWith("/rest/v1/topic_follows")) return json(res, [{ kind: "team", topic: "Seattle Seahawks" }]);
  if (u.startsWith("/rest/v1/")) return json(res, []);
  json(res, {}, 404);
}).listen(54321, "127.0.0.1", () => console.log("ui-smoke stub on 127.0.0.1:54321"));
