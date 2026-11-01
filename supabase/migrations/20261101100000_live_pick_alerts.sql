-- Live game day, step 3 (owner, Oct 31 2026): one alert per published pick, the moment it is decided
-- (an Over clears, a scorer scores, or the game goes final). A new 'pick' notification type through
-- the existing emitter: in-app plus push, member preferences, quiet hours and per-recipient dedup.
-- Pick research is member content, so recipients are age-eligible members and admins only.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check(type in ('like','comment','reply','mention','follow','share','comment_reaction','message','group_message','message_request','message_reminder','welcome','profile_reminder','security','password_change','account','feature','suggestion','contributor','post','pick'));
alter table public.notification_preferences drop constraint notification_preferences_types_check;
alter table public.notification_preferences add constraint notification_preferences_types_check check(disabled_types <@ array['like','comment','reply','mention','follow','share','comment_reaction','message','group_message','message_request','message_reminder','welcome','profile_reminder','security','password_change','account','feature','suggestion','contributor','post','pick']);
-- Pick alerts open the game's matchup: allow exactly those paths besides the existing ones.
alter table public.notifications drop constraint notifications_deep_link_check;
alter table public.notifications add constraint notifications_deep_link_check check((deep_link ~ '^/(community|notifications|membership|account|messages|feed)([/?#]|$)' or deep_link ~ '^/(nba|nhl|ncaab)/games/[a-z0-9-]{1,120}$') and deep_link !~ '^//');
-- A decided pick is time-sensitive: high priority pushes within seconds, not after the batch window.
do $$declare definition text;begin
 select pg_get_functiondef('private.emit_notification(uuid,uuid,text,text,uuid,uuid,uuid,text,text)'::regprocedure) into definition;
 if position('''share'',''contributor'') then ''high''' in definition)>0 then
  execute replace(definition,'''share'',''contributor'') then ''high''','''share'',''contributor'',''pick'') then ''high''');
 elsif position('''share'') then ''high''' in definition)>0 then
  execute replace(definition,'''share'') then ''high''','''share'',''pick'') then ''high''');
 else raise exception 'Notification emitter changed; review integration';end if;
end$$;

-- One row per decided pick: the fan-out runs once, however often the checker sees it.
create table private.live_pick_alerts(
 pick_id uuid primary key,
 sport text not null check(sport in ('nba','nhl','ncaab')),
 message text not null,
 recipients integer not null default 0,
 created_at timestamptz not null default now()
);
alter table private.live_pick_alerts enable row level security;
revoke all on private.live_pick_alerts from public,anon,authenticated,service_role;

create function private.live_pick_alert(p_sport text,p_pick uuid,p_message text,p_link text) returns integer
language plpgsql security definer set search_path='' as $$
declare r record;n integer:=0;
begin
 if p_sport not in ('nba','nhl','ncaab') or p_pick is null or coalesce(btrim(p_message),'')='' or length(p_message)>200
  or p_link !~ '^/(nba|nhl|ncaab)/games/[a-z0-9-]{1,120}$' then raise exception 'Invalid live alert';end if;
 -- The pick must be one we published, on a game of that sport that has started.
 if p_sport='nba' then
  if not exists(select 1 from public.nba_editorial_picks p join public.nba_games g on g.id=p.game_id where p.id=p_pick and g.tipoff<=now()
   and not exists(select 1 from public.nba_editorial_picks n where n.supersedes_id=p.id)) then raise exception 'Unknown pick';end if;
 elsif not exists(select 1 from public.sports_selections s join public.sports_games g on g.id=s.game_id where s.id=p_pick and g.sport=p_sport and g.start_time<=now()) then raise exception 'Unknown pick';end if;
 insert into private.live_pick_alerts(pick_id,sport,message) values(p_pick,p_sport,p_message) on conflict do nothing;
 if not found then return 0;end if;
 for r in
  select u.id from auth.users u
  where u.email_confirmed_at is not null and private.age_eligible(u.id) and (
   exists(select 1 from private.admin_users a where a.user_id=u.id)
   or exists(select 1 from private.memberships m where m.user_id=u.id and m.revoked_at is null and m.starts_at<=now() and m.expires_at>now())
   or exists(select 1 from private.billing_subscriptions b where b.user_id=u.id and not b.blocked and b.paid_until>now()))
 loop
  if private.emit_notification(r.id,null,'pick','pick-live:'||p_pick::text,p_pick,null,null,p_message,p_link) is not null then n:=n+1;end if;
 end loop;
 update private.live_pick_alerts set recipients=n where pick_id=p_pick;
 return n;
end$$;
create function public.live_pick_alert(p_sport text,p_pick uuid,p_message text,p_link text) returns integer
language sql security invoker set search_path='' as $$select private.live_pick_alert(p_sport,p_pick,p_message,p_link)$$;
revoke all on function private.live_pick_alert(text,uuid,text,text),public.live_pick_alert(text,uuid,text,text) from public,anon,authenticated;
grant execute on function private.live_pick_alert(text,uuid,text,text),public.live_pick_alert(text,uuid,text,text) to service_role;

-- The picks the checker should look at: published, game started in the last six hours, not yet alerted.
create function public.live_pick_candidates() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(x),'[]'::jsonb) from (
  select 'nba' sport,p.id,g.provider_id,g.slug,p.market,null::text side,p.direction,p.line,p.player,p.supersedes_id
  from public.nba_editorial_picks p join public.nba_games g on g.id=p.game_id
  where g.tipoff between now()-interval '6 hours' and now() and not exists(select 1 from private.live_pick_alerts a where a.pick_id=p.id)
   -- A revised pick is withdrawn: only its latest revision can alert, alerted already or not.
   and not exists(select 1 from public.nba_editorial_picks n where n.supersedes_id=p.id)
  union all
  select g.sport,s.id,g.provider_id,g.slug,m.payload->>'market',m.payload->>'side',m.payload->>'direction',(m.payload->>'line')::numeric,m.payload->>'player',null::uuid
  from public.sports_selections s join public.sports_games g on g.id=s.game_id join public.sports_markets m on m.id=s.market_id
  where g.start_time between now()-interval '6 hours' and now() and not exists(select 1 from private.live_pick_alerts a where a.pick_id=s.id)
 ) x
$$;
revoke all on function public.live_pick_candidates() from public,anon,authenticated;
grant execute on function public.live_pick_candidates() to service_role;

-- Every two minutes, and only while such picks exist, ask the app to check them.
create function private.invoke_live_pick_alerts() returns void language plpgsql security definer set search_path='' as $$ begin
 if jsonb_array_length(public.live_pick_candidates())>0 then
  perform net.http_post(url:='https://vegasquant.app/api/live/alerts',headers:=jsonb_build_object('Content-Type','application/json','x-vq-dispatch',(select v.decrypted_secret from private.push_config c join vault.decrypted_secrets v on v.id=c.dispatch_secret)),body:='{}'::jsonb,timeout_milliseconds:=10000);
 end if;end $$;
revoke all on function private.invoke_live_pick_alerts() from public,anon,authenticated;
select cron.schedule('vq-live-pick-alerts','*/2 * * * *','select private.invoke_live_pick_alerts();');
