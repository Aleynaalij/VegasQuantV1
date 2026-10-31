-- Serialize the existing editorial family check, verify its author and restore caller claims.
-- Also keep real newlines in Zone copy (the initial hosted application used literal slash-n).
do $$begin
 if (select md5(prosrc) from pg_proc where oid='private.sports_publish_automated(uuid,text,text,text)'::regprocedure)
   not in ('503fdeaa9e19db3be63db11560cb6509','362a72fba6e3894e3a4ff8968da3664c','e79ac45dce0ac955633b0184438648bf') then
  raise exception 'Editorial helper changed; coordinate before applying publication correction';
 end if;
end $$;
create or replace function private.sports_publish_automated(p_market uuid, p_title text, p_why text, p_risk text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.sports_markets; g public.sports_games; author uuid; s uuid; post uuid; line text;old_sub text:=current_setting('request.jwt.claim.sub',true);old_claims text:=current_setting('request.jwt.claims',true);
begin
 select user_id into author from private.zone_automation where name = 'sports_editorial';
 if author is null or author is distinct from (select user_id from private.zone_automation where name='nba_threes') then raise exception 'Editorial author identity mismatch';end if;
 if not coalesce(private.age_eligible(author),false) or not exists(select 1 from public.community_profiles where user_id=author and length(trim(username))>=3 and avatar is not null) then raise exception 'Editorial author profile or age is not ready';end if;
 select * into m from public.sports_markets where id = p_market;
 if not found then raise exception 'Unknown quote'; end if;
 select * into g from public.sports_games where id = m.game_id;
 perform pg_advisory_xact_lock(hashtextextended(jsonb_build_array('sports-editorial',g.id,m.payload->>'market',m.payload->>'player')::text,0));
 select * into g from public.sports_games where id = m.game_id;
 if clock_timestamp() >= m.expires_at or clock_timestamp() >= g.start_time or coalesce((g.payload->>'completed')::boolean, false) or coalesce((g.payload->>'start_time_tbd')::boolean,false) or coalesce(g.payload->>'status','') ~ 'FINAL|IN_PROGRESS|HALFTIME|CANCEL|POSTPON|SUSPEND' then raise exception 'Quote closed'; end if;
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
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 return jsonb_build_object('selection', s, 'post', post, 'line', line);
end $$;
revoke all on function private.sports_publish_automated(uuid, text, text, text) from public, anon, authenticated, service_role;
