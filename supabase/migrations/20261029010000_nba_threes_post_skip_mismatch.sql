-- The daily 3-point post waited for every recorded game to have attempts. A game ESPN corrected after it
-- was recorded never gets them (MISMATCH), which would have held the post back for the rest of the season.
-- Such games are now left out of the wait; their attempts are simply absent from the averages.
create or replace function private.nba_threes_post() returns jsonb
language plpgsql security definer set search_path='' as $$
declare today date := (now() at time zone 'America/New_York')::date; games integer; author uuid; recorded integer; pending integer;
 attempted text; made text; post uuid; title text; body text;
begin
 if exists (select 1 from private.nba_threes_posts where day = today and status = 'POSTED') then return jsonb_build_object('status','ALREADY_POSTED'); end if;
 select count(*) into games from public.nba_games where season_type = 2 and (tipoff at time zone 'America/New_York')::date = today;
 if games = 0 then return jsonb_build_object('status','NO_GAMES'); end if;
 select user_id into author from private.zone_automation where name = 'nba_threes';
 if author is null then
  insert into private.nba_threes_posts(day,status,detail) values(today,'SKIPPED','No Zone author configured')
  on conflict(day) do update set status=excluded.status, detail=excluded.detail, updated_at=now();
  return jsonb_build_object('status','SKIPPED');
 end if;
 -- Wait while recorded games are still missing attempts (the backfill, or last night's games). A game whose
 -- box score ESPN changed after it was recorded (MISMATCH) can't get attempts, so it no longer blocks the post.
 select count(*) filter (where exists (select 1 from public.nba_player_three_attempts a where a.game_id = r.game_id)),
        count(*) filter (where not exists (select 1 from public.nba_player_three_attempts a where a.game_id = r.game_id))
 into recorded, pending from public.nba_game_results r join public.nba_games g on g.id = r.game_id
 where g.season_type = 2 and not exists (select 1 from private.nba_three_attempt_checks c where c.game_id = r.game_id and c.status = 'MISMATCH')
  and g.season = (select max(season) from public.nba_games where season_type = 2 and (tipoff at time zone 'America/New_York')::date = today);
 if pending > 0 then
  insert into private.nba_threes_posts(day,status,detail) values(today,'WAITING',pending||' recorded games still missing 3-point attempts')
  on conflict(day) do update set status=excluded.status, detail=excluded.detail, updated_at=now();
  return jsonb_build_object('status','WAITING','pending',pending);
 end if;
 select string_agg(format('%s. %s (%s) %s att · %s made · %s%%', n, player, abbr, to_char(tpa,'FM990.0'), to_char(tpm,'FM990.0'),
   case when tpa > 0 then to_char(100*tpm/tpa,'FM990') else '0' end), E'\n' order by n)
 into attempted from (select *, row_number() over (order by tpa desc, tpm desc, player) n from private.nba_threes_lines(today)) x where n <= 10;
 select string_agg(format('%s. %s (%s) %s made · %s att · %s%%', n, player, abbr, to_char(tpm,'FM990.0'), to_char(tpa,'FM990.0'),
   case when tpa > 0 then to_char(100*tpm/tpa,'FM990') else '0' end), E'\n' order by n)
 into made from (select *, row_number() over (order by tpm desc, tpa desc, player) n from private.nba_threes_lines(today)) x where n <= 10;
 if attempted is null then
  insert into private.nba_threes_posts(day,status,detail) values(today,'SKIPPED','No player on today''s teams has 3 games with recorded attempts')
  on conflict(day) do update set status=excluded.status, detail=excluded.detail, updated_at=now();
  return jsonb_build_object('status','SKIPPED');
 end if;
 title := '3-point volume · ' || trim(to_char(today, 'Dy Mon FMDD'));
 body := format(E'Today''s slate: %s game%s. Season per-game averages for players on today''s teams (min. 3 games).\n\n'
  || E'Most 3s attempted per game\n%s\n\nMost 3s made per game\n%s\n\nResearch only, not picks. Box scores: ESPN.',
  games, case when games = 1 then '' else 's' end, attempted, made);
 -- Publish as the owner: the Zone's own checks (profile, rate limit, safety) run as they do for a member.
 perform set_config('request.jwt.claim.sub', author::text, true);
 perform set_config('request.jwt.claims', json_build_object('sub', author, 'role', 'authenticated')::text, true);
 perform set_config('vq.automated_post', 'on', true);
 begin
  insert into public.community_posts(user_id, sport, kind, title, body) values(author, 'nba', 'talk', title, body) returning id into post;
 exception when others then
  perform set_config('vq.automated_post', '', true);
  insert into private.nba_threes_posts(day,status,detail) values(today,'FAILED',left(sqlerrm,200))
  on conflict(day) do update set status=excluded.status, detail=excluded.detail, updated_at=now();
  return jsonb_build_object('status','FAILED','reason',sqlerrm);
 end;
 perform set_config('vq.automated_post', '', true);
 insert into private.nba_threes_posts(day,status,post_id,detail) values(today,'POSTED',post,null)
 on conflict(day) do update set status=excluded.status, post_id=excluded.post_id, detail=null, updated_at=now();
 return jsonb_build_object('status','POSTED','post_id',post);
end $$;
