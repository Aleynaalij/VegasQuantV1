-- NHL and college basketball picks (owner, Oct 31 2026: "I want you handling the picks", #166).
-- Admin publication (sports_publish_selection) needs a live signed-in admin session. Picks written by Vegas Quant's
-- scheduled editorial run publish through this server-only path instead, as the configured Zone author (MikeQ, like
-- the daily 3-point card). Same rules as the admin path: an exact stored FanDuel quote that is still open, before
-- the game starts, with analysis and risk. No model probability, stake or payout is recorded.
insert into private.zone_automation(name, user_id)
select 'sports_editorial', user_id from private.zone_automation where name = 'nba_threes'
on conflict do nothing;

create or replace function private.sports_publish_automated(p_market uuid, p_title text, p_why text, p_risk text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.sports_markets; g public.sports_games; author uuid; s uuid; post uuid; line text;
begin
 select user_id into author from private.zone_automation where name = 'sports_editorial';
 if author is null then raise exception 'No editorial author configured'; end if;
 select * into m from public.sports_markets where id = p_market;
 if not found then raise exception 'Unknown quote'; end if;
 select * into g from public.sports_games where id = m.game_id;
 if now() >= m.expires_at or now() >= g.start_time or coalesce((g.payload->>'completed')::boolean, false) then raise exception 'Quote closed'; end if;
 if length(trim(p_title)) not between 3 and 120 or length(trim(p_why)) not between 20 and 2000 or length(trim(p_risk)) not between 20 and 2000 then
  raise exception 'Analysis and risk required';
 end if;
 -- One selection per exact quote family: never publish both sides of a game or the same pick twice.
 if exists (select 1 from public.sports_selections x join public.sports_markets q on q.id = x.market_id
            where x.game_id = g.id and q.payload->>'market' = m.payload->>'market'
              and q.payload->>'player' is not distinct from m.payload->>'player') then
  raise exception 'Already published for this market';
 end if;
 line := coalesce(m.payload->>'player' || ' · ', '') ||
  case m.payload->>'market'
   when 'h2h' then (m.payload->>'selection') || ' moneyline'
   when 'spreads' then (m.payload->>'selection') || ' ' || case when (m.payload->>'line')::numeric > 0 then '+' else '' end || (m.payload->>'line')
   when 'totals' then (m.payload->>'direction') || ' ' || (m.payload->>'line') || ' goals'
   when 'player_goal_scorer_anytime' then 'anytime goal'
   else (m.payload->>'direction') || ' ' || (m.payload->>'line') || ' ' || replace(m.payload->>'market', 'player_', '')
  end || ' (' || case when (m.payload->>'odds')::int > 0 then '+' else '' end || (m.payload->>'odds') || ' at FanDuel, '
  || to_char(m.observed_at at time zone 'America/New_York', 'FMHH12:MI AM') || ' ET)';
 insert into public.sports_selections(game_id, market_id, title, why, risk, author_id, expires_at, sources)
 values (g.id, m.id, trim(p_title), trim(p_why), trim(p_risk), author, least(m.expires_at, g.start_time), jsonb_build_array(m.payload->'source'))
 returning id into s;
 -- Publish to the one Zone as the author: the Zone's own checks run as they do for a member post.
 perform set_config('request.jwt.claim.sub', author::text, true);
 perform set_config('request.jwt.claims', json_build_object('sub', author, 'role', 'authenticated')::text, true);
 insert into public.community_posts(user_id, sport, kind, title, body, legs)
 values (author, g.sport, 'talk', trim(p_title),
  line || E'\n\n' || trim(p_why) || E'\n\nRisk: ' || trim(p_risk) ||
  E'\n\nVegas Quant editorial read, not a guaranteed result. Prices move; check the current line.', '[]'::jsonb)
 returning id into post;
 return jsonb_build_object('selection', s, 'post', post, 'line', line);
end $$;
revoke all on function private.sports_publish_automated(uuid, text, text, text) from public, anon, authenticated, service_role;
