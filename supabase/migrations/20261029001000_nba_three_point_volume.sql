-- NBA 3-point volume (owner, Oct 28 2026): who attempts and who makes the most threes per game, for
-- the players on that day's slate.
--  * Box scores so far kept threes made only. Attempts are stored alongside, in their own append-only
--    table: recorded box-score rows are immutable. An attempt row is accepted only when the game is
--    recorded and every player's made count matches the recorded line.
--  * nba-results fills attempts for each recorded game, and backfills older recorded games a few per run.
--  * Every morning, after the overnight results are confirmed, a "3-point volume" post goes to The Zone
--    from the owner's account (the one admin). It is research, not picks, and sends no notifications:
--    Zone notifications stay for posts by members.
--  * While NBA is paused, the Zone's Latest feed shows NBA posts too (community_feed 'all').
create extension if not exists pg_cron;

create table public.nba_player_three_attempts(
 game_id uuid not null,
 athlete_id text not null,
 attempts integer not null check(attempts between 0 and 99),
 recorded_at timestamptz not null default now(),
 primary key(game_id, athlete_id),
 foreign key(game_id, athlete_id) references public.nba_player_results(game_id, athlete_id)
);
create trigger immutable_nba_player_three_attempts before update or delete on public.nba_player_three_attempts
 for each row execute function private.immutable();
alter table public.nba_player_three_attempts enable row level security;
grant select on public.nba_player_three_attempts to anon, authenticated, service_role;
create policy public_read on public.nba_player_three_attempts for select to anon, authenticated using (true);
create policy age_verified_account on public.nba_player_three_attempts as restrictive for all to authenticated
 using ((select private.age_member_allowed()));

-- Why a recorded game has no attempts yet, so a game ESPN no longer agrees with is not re-read every run.
create table private.nba_three_attempt_checks(game_id uuid primary key references public.nba_games(id), status text not null,
 detail text, checked_at timestamptz not null default now());
alter table private.nba_three_attempt_checks enable row level security;
revoke all on private.nba_three_attempt_checks from public, anon, authenticated, service_role;

create function private.record_nba_three_attempts(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.nba_games; bad integer; n integer;
begin
 select * into g from public.nba_games where provider_id = p->>'provider_id';
 if not found then return jsonb_build_object('status','UNKNOWN_GAME'); end if;
 if not exists (select 1 from public.nba_game_results where game_id = g.id) then return jsonb_build_object('status','PENDING'); end if;
 if exists (select 1 from public.nba_player_three_attempts where game_id = g.id) then return jsonb_build_object('status','RECORDED'); end if;
 -- Every recorded player must be in the read with the same threes made, and attempts no fewer than made.
 select count(*) into bad from public.nba_player_results r
  left join lateral (select e as x from jsonb_array_elements(coalesce(p->'players','[]')) e where e->>'athlete_id' = r.athlete_id limit 1) j on true
  where r.game_id = g.id and case
   when j.x is null then true
   when coalesce(j.x->>'threes','') !~ '^\d{1,2}$' or coalesce(j.x->>'three_attempts','') !~ '^\d{1,2}$' then true
   when (j.x->>'threes')::int <> r.threes then true
   when (j.x->>'three_attempts')::int < r.threes then true
   when not r.played and (j.x->>'three_attempts')::int <> 0 then true
   else false end;
 if bad > 0 then
  insert into private.nba_three_attempt_checks(game_id,status,detail,checked_at) values(g.id,'MISMATCH',bad||' player lines differ from the recorded box score',now())
  on conflict(game_id) do update set status=excluded.status, detail=excluded.detail, checked_at=now();
  return jsonb_build_object('status','MISMATCH','players',bad);
 end if;
 insert into public.nba_player_three_attempts(game_id, athlete_id, attempts)
 select g.id, r.athlete_id, (j.x->>'three_attempts')::int from public.nba_player_results r
  join lateral (select e as x from jsonb_array_elements(p->'players') e where e->>'athlete_id' = r.athlete_id limit 1) j on true
  where r.game_id = g.id;
 get diagnostics n = row_count;
 delete from private.nba_three_attempt_checks where game_id = g.id;
 return jsonb_build_object('status','RECORDED','players',n);
end $$;
create function public.record_nba_three_attempts(p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.record_nba_three_attempts(p) $$;

-- Recorded games still missing attempts, newest first; a game that failed is retried after 12 hours.
create function private.nba_three_attempts_missing(p_limit integer) returns table(id uuid, provider_id text, away_team text, home_team text, tipoff timestamptz)
language sql stable security definer set search_path='' as $$
 select g.id, g.provider_id, g.away_team, g.home_team, g.tipoff from public.nba_game_results r join public.nba_games g on g.id = r.game_id
 where not exists (select 1 from public.nba_player_three_attempts a where a.game_id = r.game_id)
  and not exists (select 1 from private.nba_three_attempt_checks c where c.game_id = r.game_id and c.checked_at > now() - interval '12 hours')
 order by g.tipoff desc limit greatest(0, least(p_limit, 30))
$$;
create function public.nba_three_attempts_missing(p_limit integer) returns table(id uuid, provider_id text, away_team text, home_team text, tipoff timestamptz)
language sql security invoker set search_path='' as $$ select * from private.nba_three_attempts_missing(p_limit) $$;
revoke all on function private.record_nba_three_attempts(jsonb), public.record_nba_three_attempts(jsonb),
 private.nba_three_attempts_missing(integer), public.nba_three_attempts_missing(integer) from public, anon, authenticated;
grant execute on function private.record_nba_three_attempts(jsonb), public.record_nba_three_attempts(jsonb),
 private.nba_three_attempts_missing(integer), public.nba_three_attempts_missing(integer) to service_role;

-- Automated Zone posts are written as the owner. Configured only when there is exactly one admin.
create table private.zone_automation(name text primary key, user_id uuid not null references auth.users(id));
alter table private.zone_automation enable row level security;
revoke all on private.zone_automation from public, anon, authenticated, service_role;
insert into private.zone_automation(name, user_id)
select 'nba_threes', user_id from private.admin_users where (select count(*) from private.admin_users) = 1;

create table private.nba_threes_posts(day date primary key, status text not null, post_id uuid references public.community_posts(id) on delete set null,
 detail text, updated_at timestamptz not null default now());
alter table private.nba_threes_posts enable row level security;
revoke all on private.nba_threes_posts from public, anon, authenticated, service_role;

-- The post body: season per-game averages over games with recorded attempts, minimum 3 such games.
create function private.nba_threes_lines(p_day date) returns table(athlete_id text, player text, abbr text, games integer, tpa numeric, tpm numeric)
language sql stable security definer set search_path='' as $$
 with slate as (
  select away_team team, coalesce(away_abbreviation, away_team) abbr, season from public.nba_games
   where season_type = 2 and (tipoff at time zone 'America/New_York')::date = p_day
  union
  select home_team, coalesce(home_abbreviation, home_team), season from public.nba_games
   where season_type = 2 and (tipoff at time zone 'America/New_York')::date = p_day),
 season_games as (
  select g.id, g.tipoff from public.nba_games g where g.season_type = 2 and g.season in (select season from slate)
   and g.tipoff < (p_day::timestamp at time zone 'America/New_York')),
 box as (
  select r.athlete_id, r.player, r.team, r.threes, a.attempts, s.tipoff from public.nba_player_results r
   join season_games s on s.id = r.game_id
   join public.nba_player_three_attempts a on a.game_id = r.game_id and a.athlete_id = r.athlete_id
   where r.played),
 latest as (select distinct on (athlete_id) athlete_id, player, team from box order by athlete_id, tipoff desc)
 select l.athlete_id, l.player, s.abbr, count(*)::int, avg(b.attempts), avg(b.threes)
 from latest l join (select distinct team, abbr from slate) s on s.team = l.team join box b on b.athlete_id = l.athlete_id
 group by l.athlete_id, l.player, s.abbr having count(*) >= 3
$$;
revoke all on function private.nba_threes_lines(date) from public, anon, authenticated, service_role;

create function private.nba_threes_post() returns jsonb
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
 -- Wait while recorded games are still missing attempts (the backfill, or last night's games).
 select count(*) filter (where exists (select 1 from public.nba_player_three_attempts a where a.game_id = r.game_id)),
        count(*) filter (where not exists (select 1 from public.nba_player_three_attempts a where a.game_id = r.game_id))
 into recorded, pending from public.nba_game_results r join public.nba_games g on g.id = r.game_id
 where g.season_type = 2 and g.season = (select max(season) from public.nba_games where season_type = 2 and (tipoff at time zone 'America/New_York')::date = today);
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
revoke all on function private.nba_threes_post() from public, anon, authenticated, service_role;

-- Zone notifications are for posts by members; automated research posts are skipped.
create or replace function private.zone_post_notify() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient record;mentioned text[];link text;
begin
 if current_setting('vq.automated_post', true) = 'on' then return new; end if;
 -- Members @mentioned in the post already get a 'mention' notification for it.
 select coalesce(array_agg(distinct lower(m[2])),'{}') into mentioned from regexp_matches(coalesce(new.body,''),'(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{3,24})\M','g') m;
 link:='/community?sport='||new.sport||'&post='||new.id::text||'#post-'||new.id::text;
 for recipient in
  select u.id from auth.users u left join public.community_profiles cp on cp.user_id=u.id
  where u.email_confirmed_at is not null and u.id<>new.user_id and (cp.username is null or lower(cp.username)<>all(mentioned))
 loop
  perform private.emit_notification(recipient.id,new.user_id,'post','post:'||new.id::text,new.id,new.id,null,'posted in The Zone: '||left(coalesce(nullif(btrim(new.title),''),new.body,''),160),link);
 end loop;
 return new;
end$$;

-- 'all' lists both sports (used while the NBA Zone is paused); 'nfl' and 'nba' are unchanged.
create or replace function public.community_feed(p_sport text default 'nfl', p_limit integer default 20, p_following boolean default false)
returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
 select p.*,(select count(*) from public.community_reactions r where r.post_id=p.id) as reactions,
 exists(select 1 from public.community_reactions r where r.post_id=p.id and r.user_id=auth.uid()) as reacted,
 (select count(*) from public.community_post_comments c where c.post_id=p.id) as comments,
 exists(select 1 from public.member_follows f where f.user_id=auth.uid() and f.target_user_id=p.user_id) as following
 from public.community_posts p where (p_sport='all' or p.sport=p_sport) and (not p_following or exists(select 1 from public.member_follows f where f.user_id=auth.uid() and f.target_user_id=p.user_id))
 order by p.created_at desc,p.id desc limit greatest(1,least(p_limit,100))
 )x
$$;

-- After the morning confirmation runs (nba-results-confirm at 13:10 and 14:10 UTC); idempotent per ET day.
do $$
begin
 if exists (select 1 from cron.job where jobname = 'nba-threes-post') then perform cron.unschedule('nba-threes-post'); end if;
 perform cron.schedule('nba-threes-post', '20 14,15 * * *', 'select private.nba_threes_post()');
end $$;
