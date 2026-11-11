-- Zone posts tied to their games (owner request, Nov 10 2026): research the Dealer publishes about a
-- matchup (cheat sheets, WR matchups, defense vs position, NHL charts, picks, slate cards) showed only in
-- The Zone, because community_posts has no link to a game. This adds that link and a reader for every
-- sport's matchup page, so a published post appears wherever its game does.
--  * private.zone_post_games: (post, game) pairs. Written only by the tagger below; nothing is granted.
--  * private.zone_tag_post: tags a publisher (zone_automation) post to the games of its own sport that
--    start from 6 hours before to 8 days after it was posted, when the post
--      1. names the matchup, "Away @ Home" / "at" / "vs" with full names or nicknames, in title or body;
--      2. is an NFL slate line in the "(NYG) vs PHI" abbreviation form;
--      3. is the NBA 3-point slate card for that game's day and lists one of its teams as "(ORL)";
--      4. is an NBA editorial pick recorded in nba_editorial_picks at the same instant; or
--      5. is the NHL charts post recorded for the game in private.nhl_chart_snapshots.
--    Teams that meet twice inside the window: the post goes to the nearest game only.
--    Member posts are never tagged. A tagging failure never blocks a publication.
--  * public.game_zone_posts: the tagged posts for one game, newest first, under the same gates as the
--    Zone feed (signed in, age-verified, author not hidden from you).
--  * Existing posts from the last 21 days are tagged once here.

create table private.zone_post_games (
 post_id uuid not null references public.community_posts(id) on delete cascade,
 game_id uuid not null,
 sport text not null,
 tagged_at timestamptz not null default now(),
 primary key (post_id, game_id)
);
create index zone_post_games_game on private.zone_post_games (sport, game_id);
alter table private.zone_post_games enable row level security;
revoke all on private.zone_post_games from public, anon, authenticated;

create function private.zone_rx(p text) returns text language sql immutable set search_path='' as
 $$select regexp_replace(trim(p), '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g')$$;

-- Every game the app has a matchup page for, with the names a post may use for each side.
create view private.zone_game_index as
 select 'nfl'::text as sport, g.id as game_id, g.kickoff as start_time,
  g.away_team as away, g.home_team as home, g.away_abbreviation as away_abbr, g.home_abbreviation as home_abbr,
  null::text as away_short, null::text as home_short
 from public.games g where coalesce(g.sport, 'nfl') = 'nfl'
 union all
 select 'nba', n.id, n.tipoff, n.away_team, n.home_team, n.away_abbreviation, n.home_abbreviation, null, null
 from public.nba_games n
 union all
 select s.sport, s.id, s.start_time, s.payload->'away'->>'name', s.payload->'home'->>'name',
  s.payload->'away'->>'abbreviation', s.payload->'home'->>'abbreviation',
  s.payload->'away'->>'short_name', s.payload->'home'->>'short_name'
 from public.sports_games s;

-- The ways a post may name one side: full name, the name without its first word ("Trail Blazers"),
-- the last word ("Commanders") for pro teams, and the source's short name ("Utah State").
create function private.zone_side_rx(p_sport text, p_name text, p_short text) returns text
language sql immutable set search_path='' as $$
 select string_agg(distinct private.zone_rx(n), '|') from unnest(array[
  p_name, p_short,
  case when p_sport in ('nfl','nba','nhl') and p_name ~ ' ' then regexp_replace(p_name, '^\S+\s+', '') end,
  case when p_sport in ('nfl','nba','nhl') and p_name ~ ' ' then substring(p_name from '\S+$') end
 ]) n where n is not null and length(trim(n)) >= 3
$$;

create function private.zone_tag_post(p_post uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare p public.community_posts; txt text; n integer := 0; g record; a text; h text; hit boolean; threes_day date;
 tail text; seen text[] := '{}'; pair text;
 has_charts boolean := to_regclass('private.nhl_chart_snapshots') is not null;
begin
 select * into p from public.community_posts where id = p_post;
 if not found or not exists (select 1 from private.zone_automation z where z.user_id = p.user_id) then return 0; end if;
 delete from private.zone_post_games where post_id = p_post;
 txt := coalesce(p.title, '') || E'\n' || coalesce(p.body, '');
 threes_day := case when p.card ~ '^nba-threes:\d{4}-\d{2}-\d{2}$' then substring(p.card from 12)::date end;
 -- College names nest ("Utah" inside "Utah State"), so a college home side may not run on into another word.
 tail := case when p.sport = 'ncaab' then '(?!\s+[A-Z])' else '' end;
 for g in select * from private.zone_game_index i where i.sport = p.sport
   and i.start_time between p.created_at - interval '6 hours' and p.created_at + interval '8 days'
   order by i.start_time, i.game_id loop
  -- Teams that meet twice inside the window: a post belongs to the nearest game only.
  pair := g.away || '|' || g.home;
  continue when pair = any(seen);
  a := private.zone_side_rx(g.sport, g.away, g.away_short);
  h := private.zone_side_rx(g.sport, g.home, g.home_short);
  hit := false;
  if a is not null and h is not null then
   if tail = '' then
    hit := txt ~* ('\m(' || a || ')\s*(@|at|vs\.?|v\.?)\s+(' || h || ')\M')
        or txt ~* ('\m(' || h || ')\s*(vs\.?|v\.?)\s+(' || a || ')\M');
   else
    hit := txt ~ ('\m(' || a || ')\s*(@|at|vs\.?|v\.?)\s+(' || h || ')\M' || tail)
        or txt ~ ('\m(' || h || ')\s*(vs\.?|v\.?)\s+(' || a || ')\M' || tail);
   end if;
  end if;
  if not hit and p.sport = 'nfl' and g.away_abbr is not null and g.home_abbr is not null then
   hit := txt ~ ('\(' || private.zone_rx(g.away_abbr) || '\)\s+vs\.?\s+' || private.zone_rx(g.home_abbr) || '\M')
       or txt ~ ('\(' || private.zone_rx(g.home_abbr) || '\)\s+vs\.?\s+' || private.zone_rx(g.away_abbr) || '\M');
  end if;
  if not hit and threes_day is not null and (g.start_time at time zone 'America/New_York')::date = threes_day then
   hit := txt ~ ('\((' || private.zone_rx(g.away_abbr) || '|' || private.zone_rx(g.home_abbr) || ')\)');
  end if;
  if not hit and p.sport = 'nba' then
   hit := exists (select 1 from public.nba_editorial_picks e where e.game_id = g.game_id
     and e.published_at = p.created_at and p.title ilike private.zone_like(e.player) || '%');
  end if;
  -- The charts table arrives in its own migration (20261111000938); the tagger must work without it.
  if not hit and p.sport = 'nhl' and has_charts then
   execute 'select exists (select 1 from private.nhl_chart_snapshots c where c.post_id = $1 and c.game_id = $2)'
    into hit using p.id, g.game_id;
  end if;
  if hit then
   insert into private.zone_post_games (post_id, game_id, sport) values (p.id, g.game_id, g.sport)
   on conflict do nothing;
   seen := seen || pair;
   n := n + 1;
  end if;
 end loop;
 return n;
end $$;

create function private.zone_like(p text) returns text language sql immutable set search_path='' as
 $$select replace(replace(replace(p, '\', '\\'), '%', '\%'), '_', '\_')$$;

create function private.zone_tag_post_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 begin
  perform private.zone_tag_post(new.id);
 exception when others then
  raise warning 'zone_tag_post failed for %: %', new.id, sqlerrm;
 end;
 return null;
end $$;

revoke all on function private.zone_rx(text), private.zone_like(text), private.zone_side_rx(text, text, text),
 private.zone_tag_post(uuid), private.zone_tag_post_trigger() from public, anon, authenticated;
revoke all on private.zone_game_index from public, anon, authenticated;

create trigger zz_tag_post_games after insert or update of title, body, card on public.community_posts
 for each row execute function private.zone_tag_post_trigger();

create function public.game_zone_posts(p_sport text, p_game uuid, p_limit integer default 10) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid := auth.uid();
begin
 if me is null or not coalesce(private.age_member_allowed(), false) then return '[]'::jsonb; end if;
 return coalesce((
  select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
   select c.id, c.sport, c.kind, c.title, c.body, c.legs, c.card, c.photo_path, c.author_name, c.created_at,
    (select count(*) from public.community_reactions r where r.post_id = c.id) as reactions,
    (select count(*) from public.community_post_comments m where m.post_id = c.id) as comments
   from private.zone_post_games t join public.community_posts c on c.id = t.post_id
   where t.sport = p_sport and t.game_id = p_game
    and coalesce(private.community_member_allowed(c.user_id), false)
   order by c.created_at desc limit greatest(1, least(coalesce(p_limit, 10), 30))
  ) x), '[]'::jsonb);
end $$;
revoke all on function public.game_zone_posts(text, uuid, integer) from public, anon;
grant execute on function public.game_zone_posts(text, uuid, integer) to authenticated;

-- Tag what is already published (publisher posts only; the tagger ignores everything else).
select count(private.zone_tag_post(c.id)) from public.community_posts c
 where c.created_at > now() - interval '21 days'
  and exists (select 1 from private.zone_automation z where z.user_id = c.user_id);
