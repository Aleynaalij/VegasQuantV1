-- NHL.com/Rotowire analysis only. No odds, selections, publication or simulator changes.
create table private.nhl_context_sources (
 url text primary key, body text not null, sha256 text not null,
 retrieved_at timestamptz not null, expires_at timestamptz not null
);
create table private.nhl_context_progress (
 game_id uuid primary key references public.sports_games on delete cascade,
 attempted_at timestamptz not null, next_attempt_at timestamptz not null,
 status text not null, last_error text
);
create table private.nhl_context_reports (
 game_id uuid primary key references public.sports_games on delete cascade,
 report jsonb not null, recorded_at timestamptz not null default now()
);
alter table private.nhl_context_sources enable row level security;
alter table private.nhl_context_progress enable row level security;
alter table private.nhl_context_reports enable row level security;
revoke all on private.nhl_context_sources,private.nhl_context_progress,private.nhl_context_reports from public,anon,authenticated,service_role;

create function private.nhl_context_source(p_url text,p_body text default null,p_ttl integer default 900) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s private.nhl_context_sources;
begin
 if p_url !~ '^https://api-web[.]nhle[.]com/v1/(club-schedule-season/[A-Z]{2,3}/[0-9]{8}|gamecenter/[0-9]{10}/boxscore|roster/[A-Z]{2,3}/[0-9]{8}|player/[0-9]{6,10}/game-log/[0-9]{8}/2)$'
 and p_url !~ '^https://www[.]rotowire[.]com/hockey/nhl-lineups[.]php[?]date=[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Unsupported NHL source';end if;
 if p_body is not null then
  if octet_length(p_body)>2500000 or length(p_body)=0 then raise exception 'Source body size invalid';end if;
  insert into private.nhl_context_sources values(p_url,p_body,encode(sha256(convert_to(p_body,'UTF8')),'hex'),clock_timestamp(),clock_timestamp()+make_interval(secs=>greatest(60,least(p_ttl,21600))))
  on conflict(url) do update set body=excluded.body,sha256=excluded.sha256,retrieved_at=excluded.retrieved_at,expires_at=excluded.expires_at returning * into s;
 else select * into s from private.nhl_context_sources where url=p_url and expires_at>now();end if;
 if s.url is null then return null;end if;
 return jsonb_build_object('url',s.url,'body',s.body,'sha256',s.sha256,'retrieved_at',s.retrieved_at);
end $$;
create function public.nhl_context_source(p_url text,p_body text default null,p_ttl integer default 900) returns jsonb language sql security invoker set search_path='' as $$select private.nhl_context_source(p_url,p_body,p_ttl)$$;
revoke all on function private.nhl_context_source(text,text,integer),public.nhl_context_source(text,text,integer) from public,anon,authenticated,service_role;
grant execute on function private.nhl_context_source(text,text,integer),public.nhl_context_source(text,text,integer) to service_role;

create function private.nhl_context_work() returns jsonb language plpgsql security definer set search_path='' as $$
declare jobs jsonb;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('nhl-context-work',0)) then return jsonb_build_object('now',now(),'games','[]'::jsonb);end if;
 select coalesce(jsonb_agg(x.payload||jsonb_build_object('id',x.id)),'[]') into jobs from (
  select g.id,g.payload from public.sports_games g left join private.nhl_context_progress p on p.game_id=g.id
  where g.sport='nhl' and g.start_time>now() and g.start_time<now()+interval '36 hours'
   and not coalesce((g.payload->>'completed')::boolean,false) and coalesce(g.payload->>'status','') !~ 'FINAL|IN_PROGRESS|CANCEL|POSTPON|SUSPEND'
   and coalesce(p.next_attempt_at,'-infinity')<=now()
  order by coalesce(p.attempted_at,'-infinity'),g.start_time,g.id limit 2
 )x;
 insert into private.nhl_context_progress(game_id,attempted_at,next_attempt_at,status)
 select (g->>'id')::uuid,now(),now()+interval '10 minutes','collecting' from jsonb_array_elements(jobs) g
 on conflict(game_id) do update set attempted_at=excluded.attempted_at,next_attempt_at=excluded.next_attempt_at,status=excluded.status,last_error=null;
 delete from private.nhl_context_sources where expires_at<now()-interval '14 days';
 return jsonb_build_object('now',now(),'games',jobs);
end $$;
create function public.nhl_context_work() returns jsonb language sql security invoker set search_path='' as $$select private.nhl_context_work()$$;
revoke all on function private.nhl_context_work(),public.nhl_context_work() from public,anon,authenticated,service_role;
grant execute on function private.nhl_context_work(),public.nhl_context_work() to service_role;

create function private.nhl_context_finish(p_game uuid,p_report jsonb default null,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
declare g public.sports_games;
begin
 select * into g from public.sports_games where id=p_game and sport='nhl';
 if not found then raise exception 'NHL matchup required';end if;
 if p_report is not null then
  if p_report->>'version' is distinct from '1' or p_report->>'game_id' is distinct from p_game::text
   or (p_report->>'cutoff')::timestamptz is distinct from g.start_time
   or jsonb_typeof(p_report->'teams') is distinct from 'array' or jsonb_array_length(p_report->'teams')<>2
   or jsonb_typeof(p_report->'sources') is distinct from 'array' or jsonb_array_length(p_report->'sources')=0
   or octet_length(p_report::text)>150000 then raise exception 'Report binding/shape invalid';end if;
  if p_report->'teams'->0->>'abbreviation' is distinct from g.payload->'away'->>'abbreviation'
   or p_report->'teams'->1->>'abbreviation' is distinct from g.payload->'home'->>'abbreviation' then raise exception 'Report teams do not match';end if;
  insert into private.nhl_context_reports values(p_game,p_report,now()) on conflict(game_id) do update set report=excluded.report,recorded_at=excluded.recorded_at;
 end if;
 update private.nhl_context_progress set status=case when p_report is null then 'failed' else 'ready' end,last_error=left(p_error,300) where game_id=p_game;
end $$;
create function public.nhl_context_finish(p_game uuid,p_report jsonb default null,p_error text default null) returns void language sql security invoker set search_path='' as $$select private.nhl_context_finish(p_game,p_report,p_error)$$;
revoke all on function private.nhl_context_finish(uuid,jsonb,text),public.nhl_context_finish(uuid,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function private.nhl_context_finish(uuid,jsonb,text),public.nhl_context_finish(uuid,jsonb,text) to service_role;

create function private.nhl_game_context(p_game uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r private.nhl_context_reports;g public.sports_games;favorites text;
begin
 if auth.uid() is null or not coalesce(private.has_membership(),false) or not coalesce(private.age_member_allowed(),false) then return '{"state":"denied"}';end if;
 select * into g from public.sports_games where id=p_game and sport='nhl';
 if not found then return '{"state":"waiting"}';end if;
 -- Personal input is returned only to its verified author; never published as a public watchlist.
 if exists(select 1 from private.frank_anniversary_config c join public.ruby_contributors u on u.user_id=c.target_user_id and u.brand='FranksCorner' and u.active where c.singleton and c.target_user_id=auth.uid()) then
  select answers->>'players' into favorites from private.frank_nhl_feedback where user_id=auth.uid() order by created_at desc,request_id desc limit 1;
 end if;
 select * into r from private.nhl_context_reports where game_id=p_game and (report->>'cutoff')::timestamptz=g.start_time;
 if not found then return jsonb_build_object('state',case when exists(select 1 from private.nhl_context_progress where game_id=p_game and status='failed') then 'failed' else 'waiting' end,'watchlist',favorites);end if;
 return jsonb_build_object('state','ready','report',r.report,'checked_at',r.recorded_at,'watchlist',favorites);
end $$;
create function public.nhl_game_context(p_game uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.nhl_game_context(p_game)$$;
revoke all on function private.nhl_game_context(uuid),public.nhl_game_context(uuid) from public,anon,authenticated,service_role;
grant execute on function private.nhl_game_context(uuid),public.nhl_game_context(uuid) to authenticated;
