create table public.weekly_performance_reports(
 id uuid primary key default gen_random_uuid(),week_start date not null,week_end date not null,
 version integer not null check(version>0),fingerprint text not null,payload jsonb not null,
 created_at timestamptz not null default now(),unique(week_end,version),unique(week_end,fingerprint),check(week_end=week_start+7)
);
alter table public.weekly_performance_reports enable row level security;
grant select on public.weekly_performance_reports to authenticated;
create policy weekly_report_read on public.weekly_performance_reports for select to authenticated using((select private.age_member_allowed()));
create trigger immutable_weekly_report before update or delete on public.weekly_performance_reports for each row execute function private.immutable();
grant select,insert on public.weekly_performance_reports to service_role;
create function public.publish_weekly_performance(p_week_end date default null)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare ending date;starting date;start_at timestamptz;end_at timestamptz;body jsonb;fp text;report uuid;v integer;begin
 ending:=coalesce(p_week_end,(now()at time zone'America/New_York')::date-(((extract(isodow from now()at time zone'America/New_York')::integer-2)+7)%7));
 if extract(isodow from ending)<>2 or ending>(now()at time zone'America/New_York')::date then raise exception 'Choose a completed Tuesday-to-Tuesday week';end if;
 starting:=ending-7;start_at:=starting::timestamp at time zone'America/New_York';end_at:=ending::timestamp at time zone'America/New_York';
 perform pg_advisory_xact_lock(hashtextextended('weekly-performance:'||ending::text,0));
 with publications as(
 select l.*,c.value candidate,ct.game_id bound_game,ct.metric,ct.threshold,ct.operator,ct.period,e.value actual,p.status tracking_status,g.kickoff,
 case when c.value->>'analysis_kind' in('QUALITATIVE_EDITORIAL','QUALITATIVE_LIVE_EDITORIAL') and coalesce(c.value->>'experimental','false')<>'true' and coalesce(c.value->>'fun_play','false')<>'true' and c.value->'legs' is null then true else false end eligible
 from public.published_legs l join public.candidate_releases r on r.id=l.release_id
 cross join lateral(select r.candidates->(l.leg_index-1) value)c
 left join private.leg_result_contracts ct on ct.leg_key=l.leg_key
 left join private.leg_result_evidence e on e.leg_key=l.leg_key
 left join public.leg_result_progress p on p.leg_key=l.leg_key
 left join public.games g on g.id=coalesce(ct.game_id,l.game_id)
 ),bound as(
 select *,coalesce(bound_game,game_id)::text||':'||regexp_replace(lower(name),'[^a-z0-9]','','g')||':'||coalesce(period||':'||metric||':'||operator||':'||threshold::text,regexp_replace(lower(market),'[^a-z0-9]','','g')) selection_key
 from publications where eligible and kickoff>=start_at and kickoff<end_at
 ),grouped as(
 select selection_key,min(name)name,min(market)market,min(matchup)matchup,min(kickoff)kickoff,
 jsonb_agg(leg_key order by leg_key)publication_keys,count(*)publication_count,
 coalesce(bool_or(tracking_status='CONFLICT'),false)conflict,
 array_agg(distinct result)filter(where result in('WIN','LOSS','PUSH','VOID')and result_source~'^https://')outcomes,
 max(actual)actual,jsonb_agg(distinct result_source)filter(where result_source~'^https://')sources
 from bound group by selection_key
 ),legs as(
 select *,case when conflict or coalesce(array_length(outcomes,1),0)<>1 then 'PENDING'else outcomes[1]end outcome from grouped
 )
 select jsonb_build_object(
 'scope','NFL qualitative individual selections; game kickoffs Tuesday through Monday in Eastern time. Exact duplicated targets counted once. No Hail Mary, retrospective tickets, watchlists or official challenge bankrolls.',
 'week_start',starting,'week_end',ending,
 'wins',(select count(*)from legs where outcome='WIN'),'losses',(select count(*)from legs where outcome='LOSS'),
 'pushes',(select count(*)from legs where outcome='PUSH'),'voids',(select count(*)from legs where outcome='VOID'),
 'pending',(select count(*)from legs where outcome='PENDING'),
 'duplicates_removed',coalesce((select sum(publication_count-1)from legs),0),
 'unresolved_publications',(select count(*)from publications where eligible and kickoff is null and published_at>=start_at and published_at<end_at),
 'excluded_publications',(select count(*)from publications where not eligible and published_at>=start_at and published_at<end_at),
 'legs',coalesce((select jsonb_agg(jsonb_build_object('name',name,'market',market,'matchup',matchup,'result',outcome,'actual',actual,'sources',coalesce(sources,'[]'::jsonb),'publication_keys',publication_keys,'kickoff',kickoff)order by kickoff,name,market)from legs),'[]'::jsonb)
 )into body;
 fp:=md5(body::text);
 select id into report from public.weekly_performance_reports where week_end=ending and fingerprint=fp;
 if found then return jsonb_build_object('id',report,'inserted',false);end if;
 select coalesce(max(version),0)+1 into v from public.weekly_performance_reports where week_end=ending;
 insert into public.weekly_performance_reports(week_start,week_end,version,fingerprint,payload)values(starting,ending,v,fp,body)returning id into report;
 return jsonb_build_object('id',report,'inserted',true,'version',v);
 end $$;
revoke all on function public.publish_weekly_performance(date) from public,anon,authenticated;
grant execute on function public.publish_weekly_performance(date) to service_role;
