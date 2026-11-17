-- NBA prop card inputs (owner, Nov 17 2026): the prop card in the NBA research tab adds usage, defense
-- vs position and a projection. Three-point attempts were already kept; usage also needs field-goal and
-- free-throw attempts.
--  * public.nba_player_shooting: field goals and free throws made and attempted per recorded player line,
--    append-only beside the immutable box score (same pattern as nba_player_three_attempts). A read is
--    accepted only when the game is recorded and, for every recorded player, the shooting adds up to the
--    recorded line: points = 2 x field goals made + threes made + free throws made.
--  * nba-results fills it for each recorded game and backfills older recorded games a few per run.
--  * public.nba_player_usage: box-score usage rate per player game, for games whose whole team has
--    shooting recorded.
--  * public.nba_defense_vs_position: per team, what opposing guards, forwards and centers (ESPN's G/F/C)
--    scored and rebounded per game against it this season, ranked 1 (allows the fewest) to 30.
-- Readable under the same gates as the box scores themselves.

create table public.nba_player_shooting(
 game_id uuid not null,
 athlete_id text not null,
 fgm integer not null check(fgm between 0 and 99),
 fga integer not null check(fga between 0 and 99),
 ftm integer not null check(ftm between 0 and 99),
 fta integer not null check(fta between 0 and 99),
 recorded_at timestamptz not null default now(),
 primary key(game_id, athlete_id),
 foreign key(game_id, athlete_id) references public.nba_player_results(game_id, athlete_id),
 check(fgm <= fga and ftm <= fta)
);
create trigger immutable_nba_player_shooting before update or delete on public.nba_player_shooting
 for each row execute function private.immutable();
alter table public.nba_player_shooting enable row level security;
grant select on public.nba_player_shooting to anon, authenticated, service_role;
create policy public_read on public.nba_player_shooting for select to anon, authenticated using (true);
create policy age_verified_account on public.nba_player_shooting as restrictive for all to authenticated
 using ((select private.age_member_allowed()));

-- Why a recorded game has no shooting yet, so a game ESPN no longer agrees with is not re-read every run.
create table private.nba_shooting_checks(game_id uuid primary key references public.nba_games(id), status text not null,
 detail text, checked_at timestamptz not null default now());
alter table private.nba_shooting_checks enable row level security;
revoke all on private.nba_shooting_checks from public, anon, authenticated, service_role;

create function private.record_nba_shooting(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.nba_games; bad integer; n integer;
begin
 select * into g from public.nba_games where provider_id = p->>'provider_id';
 if not found then return jsonb_build_object('status','UNKNOWN_GAME'); end if;
 if not exists (select 1 from public.nba_game_results where game_id = g.id) then return jsonb_build_object('status','PENDING'); end if;
 if exists (select 1 from public.nba_player_shooting where game_id = g.id) then return jsonb_build_object('status','RECORDED'); end if;
 -- Every recorded player must be in the read, and the read must add up to the recorded line.
 select count(*) into bad from public.nba_player_results r
  left join lateral (select e as x from jsonb_array_elements(coalesce(p->'players','[]')) e where e->>'athlete_id' = r.athlete_id limit 1) j on true
  where r.game_id = g.id and case
   when j.x is null then true
   when coalesce(j.x->>'fgm','') !~ '^\d{1,2}$' or coalesce(j.x->>'fga','') !~ '^\d{1,2}$'
     or coalesce(j.x->>'ftm','') !~ '^\d{1,2}$' or coalesce(j.x->>'fta','') !~ '^\d{1,2}$' then true
   when (j.x->>'fgm')::int > (j.x->>'fga')::int or (j.x->>'ftm')::int > (j.x->>'fta')::int then true
   when (j.x->>'fgm')::int < r.threes then true
   when 2 * (j.x->>'fgm')::int + r.threes + (j.x->>'ftm')::int <> r.points then true
   when not r.played and ((j.x->>'fga')::int <> 0 or (j.x->>'fta')::int <> 0) then true
   else false end;
 if bad > 0 then
  insert into private.nba_shooting_checks(game_id,status,detail,checked_at) values(g.id,'MISMATCH',bad||' player lines differ from the recorded box score',now())
  on conflict(game_id) do update set status=excluded.status, detail=excluded.detail, checked_at=now();
  return jsonb_build_object('status','MISMATCH','players',bad);
 end if;
 insert into public.nba_player_shooting(game_id, athlete_id, fgm, fga, ftm, fta)
 select g.id, r.athlete_id, (j.x->>'fgm')::int, (j.x->>'fga')::int, (j.x->>'ftm')::int, (j.x->>'fta')::int
  from public.nba_player_results r
  join lateral (select e as x from jsonb_array_elements(p->'players') e where e->>'athlete_id' = r.athlete_id limit 1) j on true
  where r.game_id = g.id;
 get diagnostics n = row_count;
 delete from private.nba_shooting_checks where game_id = g.id;
 return jsonb_build_object('status','RECORDED','players',n);
end $$;
create function public.record_nba_shooting(p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.record_nba_shooting(p) $$;

-- Recorded games still missing shooting, newest first; a game that failed is retried after 12 hours.
create function private.nba_shooting_missing(p_limit integer) returns table(id uuid, provider_id text, away_team text, home_team text, tipoff timestamptz)
language sql stable security definer set search_path='' as $$
 select g.id, g.provider_id, g.away_team, g.home_team, g.tipoff from public.nba_game_results r join public.nba_games g on g.id = r.game_id
 where not exists (select 1 from public.nba_player_shooting s where s.game_id = r.game_id)
  and not exists (select 1 from private.nba_shooting_checks c where c.game_id = r.game_id and c.checked_at > now() - interval '12 hours')
 order by g.tipoff desc limit greatest(0, least(p_limit, 30))
$$;
create function public.nba_shooting_missing(p_limit integer) returns table(id uuid, provider_id text, away_team text, home_team text, tipoff timestamptz)
language sql security invoker set search_path='' as $$ select * from private.nba_shooting_missing(p_limit) $$;
revoke all on function private.record_nba_shooting(jsonb), public.record_nba_shooting(jsonb),
 private.nba_shooting_missing(integer), public.nba_shooting_missing(integer) from public, anon, authenticated;
grant execute on function private.record_nba_shooting(jsonb), public.record_nba_shooting(jsonb),
 private.nba_shooting_missing(integer), public.nba_shooting_missing(integer) to service_role;

-- Box-score usage rate: the share of the team's possessions a player used while on the floor,
-- 100 x (FGA + 0.44 FTA + TOV) x (team minutes / 5) / (minutes x team (FGA + 0.44 FTA + TOV)).
-- Only for games where every player on that team has shooting recorded. Runs as the caller, so the
-- box-score read policies apply.
create function public.nba_player_usage(p_athletes text[]) returns table(game_id uuid, athlete_id text, usage numeric)
language sql stable security invoker set search_path='' as $$
 with lines as (
  select r.game_id, r.athlete_id, r.team, r.minutes, r.turnovers, s.fga, s.fta
  from public.nba_player_results r join public.nba_player_shooting s using (game_id, athlete_id)
  where r.played and r.game_id in (select x.game_id from public.nba_player_results x where x.athlete_id = any(p_athletes))),
 teams as (
  select game_id, team, sum(coalesce(minutes,0)) mp, sum(fga + 0.44 * fta + turnovers) poss from lines group by game_id, team)
 select l.game_id, l.athlete_id,
  round(100 * (l.fga + 0.44 * l.fta + l.turnovers) * (t.mp / 5.0) / (l.minutes * t.poss), 1)
 from lines l join teams t using (game_id, team)
 where l.athlete_id = any(p_athletes) and l.minutes > 0 and t.poss > 0 and t.mp > 0
  and not exists (select 1 from public.nba_player_results m where m.game_id = l.game_id and m.team = l.team
   and not exists (select 1 from public.nba_player_shooting z where z.game_id = m.game_id and z.athlete_id = m.athlete_id))
$$;
revoke all on function public.nba_player_usage(text[]) from public;
grant execute on function public.nba_player_usage(text[]) to anon, authenticated, service_role;

-- What each team allowed per game to opposing G, F and C this season (regular season), ranked 1 = fewest.
create function public.nba_defense_vs_position(p_season integer)
returns table(team text, pos text, games integer, points numeric, rebounds numeric, assists numeric,
 points_rank integer, rebounds_rank integer, assists_rank integer)
language sql stable security invoker set search_path='' as $$
 with season_games as (
  select g.id, g.away_team, g.home_team from public.nba_games g
  join public.nba_game_results r on r.game_id = g.id
  where g.season_type = 2 and g.season = p_season),
 allowed as (
  select case when p.team = sg.home_team then sg.away_team else sg.home_team end as defense,
   p.game_id, p.position as pos, sum(p.points) pts, sum(p.rebounds) reb, sum(p.assists) ast
  from public.nba_player_results p join season_games sg on sg.id = p.game_id
  where p.played and p.position in ('G','F','C')
  group by 1, 2, 3),
 played as (
  select t.team, count(*)::int n from season_games sg
  cross join lateral (values (sg.away_team), (sg.home_team)) t(team) group by t.team),
 per_game as (
  select a.defense team, a.pos, pl.n games,
   sum(a.pts)::numeric / pl.n points, sum(a.reb)::numeric / pl.n rebounds, sum(a.ast)::numeric / pl.n assists
  from allowed a join played pl on pl.team = a.defense group by a.defense, a.pos, pl.n)
 select team, pos, games, round(points, 1), round(rebounds, 1), round(assists, 1),
  (rank() over (partition by pos order by points))::int,
  (rank() over (partition by pos order by rebounds))::int,
  (rank() over (partition by pos order by assists))::int
 from per_game
$$;
revoke all on function public.nba_defense_vs_position(integer) from public;
grant execute on function public.nba_defense_vs_position(integer) to anon, authenticated, service_role;
