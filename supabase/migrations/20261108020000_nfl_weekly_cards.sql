-- Sunday NFL research cards (owner request, Nov 8 2026): WR matchups (2 posts) and defense vs position
-- (one post per four Sunday/Monday games), published to the Zone as MikeQ from 7:00 AM ET on Sundays.
--  * A GitHub Action computes the cards from nflverse weekly stats and stages them with
--    public.nfl_weekly_cards_stage (service role only). Staged cards for a Sunday are replaced as a set
--    until the first one is posted; after that the day is frozen.
--  * public.nfl_weekly_card(card) returns one staged card for the image route (public research data).
--  * private.nfl_weekly_cards_post() publishes at most one card per call, at least 35 seconds after the
--    author's previous post (the Zone allows one post per 30 seconds), last card first so the first WR
--    card ends on top of the feed. pg_cron calls it every minute from 11:00 to 13:59 UTC on Sundays and it
--    only acts from 07:00 ET, so the schedule holds in both EST and EDT.

create table private.nfl_weekly_cards(
 day date not null,
 kind text not null check (kind in ('wr','dvp')),
 page integer not null check (page between 1 and 20),
 title text not null check (length(title) between 1 and 120),
 body text not null check (length(body) between 1 and 2000),
 payload jsonb not null check (jsonb_typeof(payload) = 'object'),
 status text not null default 'STAGED' check (status in ('STAGED','POSTED','FAILED')),
 post_id uuid,
 detail text,
 staged_at timestamptz not null default now(),
 posted_at timestamptz,
 primary key (day, kind, page)
);
alter table private.nfl_weekly_cards enable row level security;

alter table public.community_posts drop constraint community_posts_card_check;
alter table public.community_posts add constraint community_posts_card_check check(
 card is null or card ~ '^nba-threes:[0-9]{4}-[0-9]{2}-[0-9]{2}$' or card = 'vq-publication:v1'
 or card ~ '^nfl-(wr|dvp):[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9]{1,2}$');

create function public.nfl_weekly_cards_stage(p_day date, p_cards jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c jsonb; n integer := 0;
begin
 if extract(isodow from p_day) <> 7 then raise exception 'Weekly cards are for a Sunday'; end if;
 if jsonb_typeof(p_cards) <> 'array' or jsonb_array_length(p_cards) = 0 then raise exception 'No cards'; end if;
 if exists (select 1 from private.nfl_weekly_cards where day = p_day and status <> 'STAGED') then
  return jsonb_build_object('status','FROZEN');
 end if;
 delete from private.nfl_weekly_cards where day = p_day;
 for c in select value from jsonb_array_elements(p_cards) loop
  insert into private.nfl_weekly_cards(day, kind, page, title, body, payload)
  values (p_day, c->>'kind', (c->>'page')::integer, c->>'title', c->>'body', c->'payload');
  n := n + 1;
 end loop;
 return jsonb_build_object('status','STAGED','cards',n);
end $$;
revoke all on function public.nfl_weekly_cards_stage(date, jsonb) from public, anon, authenticated;
grant execute on function public.nfl_weekly_cards_stage(date, jsonb) to service_role;

create function public.nfl_weekly_card(p_card text) returns jsonb
language sql stable security definer set search_path='' as $$
 select payload from private.nfl_weekly_cards
 where p_card ~ '^nfl-(wr|dvp):[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9]{1,2}$'
  and kind = split_part(substr(p_card, 5), ':', 1)
  and day = split_part(p_card, ':', 2)::date
  and page = split_part(p_card, ':', 3)::integer
$$;
revoke all on function public.nfl_weekly_card(text) from public;
grant execute on function public.nfl_weekly_card(text) to anon, authenticated, service_role;

create function private.nfl_weekly_cards_post(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path='' as $$
declare now_et timestamp := p_now at time zone 'America/New_York'; today date := (p_now at time zone 'America/New_York')::date;
 author uuid; c private.nfl_weekly_cards; post uuid;
begin
 if extract(isodow from today) <> 7 or now_et::time < time '07:00' then return jsonb_build_object('status','NOT_YET'); end if;
 select * into c from private.nfl_weekly_cards where day = today and status = 'STAGED'
  order by case kind when 'dvp' then 0 else 1 end, page desc limit 1;
 if not found then return jsonb_build_object('status','NOTHING_STAGED'); end if;
 select user_id into author from private.zone_automation where name = 'nba_threes';
 if author is null then
  update private.nfl_weekly_cards set status = 'FAILED', detail = 'No Zone author configured' where day = c.day and kind = c.kind and page = c.page;
  return jsonb_build_object('status','FAILED','reason','No Zone author configured');
 end if;
 if exists (select 1 from public.community_posts where user_id = author and created_at > p_now - interval '35 seconds') then
  return jsonb_build_object('status','WAITING');
 end if;
 perform set_config('request.jwt.claim.sub', author::text, true);
 perform set_config('request.jwt.claims', json_build_object('sub', author, 'role', 'authenticated')::text, true);
 perform set_config('vq.automated_post', 'on', true);
 begin
  insert into public.community_posts(user_id, sport, kind, title, body, card)
  values (author, 'nfl', 'talk', c.title, c.body, format('nfl-%s:%s:%s', c.kind, c.day, c.page)) returning id into post;
 exception when others then
  perform set_config('vq.automated_post', '', true);
  update private.nfl_weekly_cards set status = 'FAILED', detail = left(sqlerrm, 200) where day = c.day and kind = c.kind and page = c.page;
  return jsonb_build_object('status','FAILED','reason',sqlerrm);
 end;
 perform set_config('vq.automated_post', '', true);
 update private.nfl_weekly_cards set status = 'POSTED', post_id = post, posted_at = p_now, detail = null
 where day = c.day and kind = c.kind and page = c.page;
 return jsonb_build_object('status','POSTED','card',format('nfl-%s:%s:%s', c.kind, c.day, c.page),'post_id',post);
end $$;
revoke all on function private.nfl_weekly_cards_post(timestamptz) from public, anon, authenticated;

select cron.schedule('nfl-weekly-cards-post', '* 11-13 * * 0', $$select private.nfl_weekly_cards_post()$$);
