-- Speed up the "latest quote / latest fact" lookups in public.sports_slate and public.sports_game (Claude,
-- owner request Nov 7 2026). Index-only: no function, data, grant or policy changes.
--
-- Both RPCs keep only the newest row per (game, market) and per (game, fact kind, team) with NOT EXISTS
-- anti-joins. Without matching indexes Postgres hashes the whole of sports_markets (about 39k rows with
-- their payloads) on every call: the NCAAB markets part alone took about 5.5 s, so the research lounge,
-- NHL and NCAAB pages hit the API statement timeout and showed "schedule or research source unavailable".
create index if not exists sports_markets_game_market_latest
  on public.sports_markets (game_id, (payload->>'market'), observed_at desc);
create index if not exists sports_facts_game_kind_team_latest
  on public.sports_facts (game_id, kind, (payload->>'team_id'), recorded_at desc);
analyze public.sports_markets;
analyze public.sports_facts;
