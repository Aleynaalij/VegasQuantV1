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
  { id: "00000000-0000-4000-8000-000000000005", title: "Research board · HOU @ JAX", created_at: NOW, expires_at: "2026-10-18T17:00:00Z", candidates: [leg("Sample Research Back", "Full game · 40+ rushing yards", sun, { research: true, analysis_kind: "RESEARCH_BOARD", book: "FanDuel", odds: -190 })] },
  { id: "00000000-0000-4000-8000-000000000003", title: "Sample Texans–Jaguars legs", created_at: NOW, expires_at: "2026-10-18T17:00:00Z", candidates: [leg("Sample Back", "Full game · 50+ rushing yards", sun)] },
  { id: "00000000-0000-4000-8000-000000000004", title: "Sample Sunday sleeper parlay", created_at: NOW, expires_at: "2026-10-18T17:00:00Z", candidates: [{ ...leg("Sample Sunday sleeper parlay", "3 full-game targets · cross-game parlay", sun), parlay: true, analysis_kind: "QUALITATIVE_PARLAY", parlay_legs: [
    { name: "Sample Back", market: "Full game · 50+ rushing yards", why: "Sample case.", risk: "Sample risk.", matchup: sun },
    { name: "Sample Receiver", market: "Full game · 40+ receiving yards", why: "Sample case.", risk: "Sample risk.", matchup: tnf },
    { name: "Sample Tight End", market: "Full game · 3+ receptions", why: "Sample case.", risk: "Sample risk.", matchup: sun },
  ] }] },
];
const posts = [
  { id: "w1", game: null, game_id: null, category: "Decision", title: "Sample winning ticket", summary: "Sample.", matchup: "Ravens @ Falcons", away_code: "BAL", home_code: "ATL", market_label: "zone-win:ravens-falcons-full5-20261011", why_watch: "Sample.", caution: "Sample.", next_check: "Sample.", source_url: "https://example.com", source_at: NOW, created_at: "2026-10-13T12:00:00Z" },
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
  if (rpc("tail_leaderboard")) return json(res, [{ username: "SampleMember", wins: 4, losses: 1, pushes: 0, score: 37.6 }]);
  // Synthetic shadow scorecard (admin Performance): two weeks plus the all-weeks row.
  if (rpc("admin_nfl_shadow_scorecard")) return json(res, [
    { market: "receiving", week: 6, props: 150, games: 12, hit_rate: 0.5, brier_model: 0.25, brier_market: 0.24, brier_diff: 0.01, brier_diff_se: 0.008, logloss_model: 0.69, logloss_market: 0.69, disagree_props: 50, disagree_model_right: 0.5 },
    { market: "receiving", week: null, props: 150, games: 12, hit_rate: 0.5, brier_model: 0.25, brier_market: 0.24, brier_diff: 0.01, brier_diff_se: 0.008, logloss_model: 0.69, logloss_market: 0.69, disagree_props: 50, disagree_model_right: 0.5 },
  ]);
  if (rpc("admin_nfl_shadow_calibration")) return json(res, [{ market: "receiving", bin: 5, props: 80, mean_model: 0.55, mean_market: 0.5, hit_rate: 0.52 }]);
  if (u.startsWith("/rest/v1/rpc/")) return json(res, null);
  if (u.startsWith("/rest/v1/candidate_releases")) {
    if (u.includes("pick_of_day")) return json(res, releases.slice(0, 1));
    if (u.includes("fun_play") || u.includes("expires_at=lte")) return json(res, []);
    return json(res, releases);
  }
  if (u.startsWith("/rest/v1/research_feed_posts")) return json(res, posts);
  if (u.startsWith("/rest/v1/community_profiles")) { const p = { username: "SampleMember", avatar: null, region: "Sample", visible: true }; return json(res, (req.headers.accept || "").includes("vnd.pgrst.object") ? p : [p]); }
  if (u.startsWith("/rest/v1/published_legs") && u.includes("odds")) return json(res, [
    { leg_key: "candidate:s:1", kind: "SINGLE", name: "Sample Runner", market: "Full game · 60+ rushing yards", matchup: "Buffalo @ Los Angeles Rams", game_id: "g0", published_at: "2026-10-12T10:00:00Z", result: "WIN", result_source: "https://example.com/box", odds: -150, original_leg_key: null },
    { leg_key: "candidate:s:2", kind: "SINGLE", name: "Sample Receiver", market: "Full game · 50+ receiving yards", matchup: "Buffalo @ Los Angeles Rams", game_id: "g0", published_at: "2026-10-12T10:00:00Z", result: "LOSS", result_source: "https://example.com/box", odds: -120, original_leg_key: null },
    { leg_key: "candidate:s:3", kind: "SINGLE", name: "Sample Passer", market: "Full game · 200+ passing yards", matchup: "Buffalo @ Los Angeles Rams", game_id: "g0", published_at: "2026-10-12T10:00:00Z", result: "WIN", result_source: "https://example.com/box", odds: null, original_leg_key: null },
  ]);
  if (u.startsWith("/rest/v1/leg_market_prices") && u.includes("first_price") && u.includes("kickoff=lt")) return json(res, [
    // Sample closing prices: one leg beat the close, one closed worse, one did not move.
    { leg_key: "candidate:s:1", first_price: -150, last_price: -170 },
    { leg_key: "candidate:s:2", first_price: -120, last_price: -110 },
    { leg_key: "candidate:s:3", first_price: -200, last_price: -200 },
  ]);
  if (u.startsWith("/rest/v1/leg_history")) {
    // Sample recent form for whichever legs are asked for: alternately strong and weak.
    const keys = (/leg_key=in\.\(([^)]*)\)/.exec(u)?.[1] || "").split(",").map((k) => k.replace(/"/g, "")).filter(Boolean);
    return json(res, keys.map((leg_key, i) => ({ leg_key, cleared: i % 2 ? 2 : 5, sample: 5, median: i % 2 ? 31 : 74, position: "WR" })));
  }
  if (u.startsWith("/rest/v1/leg_book_prices")) {
    // Sample line shopping: two books per requested leg.
    const keys = (/leg_key=in\.\(([^)]*)\)/.exec(u)?.[1] || "").split(",").map((k) => k.replace(/"/g, "")).filter(Boolean);
    return json(res, keys.flatMap((leg_key) => [{ leg_key, book: "FanDuel", price: -160 }, { leg_key, book: "DraftKings", price: -145 }]));
  }
  if (u.startsWith("/rest/v1/topic_follows")) return json(res, [{ kind: "team", topic: "Seattle Seahawks" }]);
  if (u.startsWith("/rest/v1/")) return json(res, []);
  json(res, {}, 404);
}).listen(54321, "127.0.0.1", () => console.log("ui-smoke stub on 127.0.0.1:54321"));
