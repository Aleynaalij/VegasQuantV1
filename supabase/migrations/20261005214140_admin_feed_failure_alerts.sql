alter table public.push_subscriptions add column health_capable boolean not null default false;
alter table private.push_deliveries drop constraint push_deliveries_kind_check;
alter table private.push_deliveries add constraint push_deliveries_kind_check check(kind in ('official','research','signup','health'));
create function public.enable_health_push(p_endpoint text) returns void language sql security definer set search_path='' as $$
 update public.push_subscriptions set health_capable=true where endpoint=p_endpoint and user_id=(select auth.uid()) and exists(select 1 from private.admin_users where user_id=(select auth.uid()));
$$;
revoke all on function public.enable_health_push(text) from public,anon;
grant execute on function public.enable_health_push(text) to authenticated;
create table private.feed_health_incident (
 singleton boolean primary key default true check(singleton),
 issue_key text not null, issues jsonb not null,
 incident_id uuid not null default gen_random_uuid(), updated_at timestamptz not null default now()
);
alter table private.feed_health_incident enable row level security;
revoke all on private.feed_health_incident from public,anon,authenticated;
create function private.check_source_health() returns jsonb language plpgsql security definer set search_path='' as $$
declare provider_name text; latest public.feed_runs%rowtype; issues jsonb:='[]'; reason text; issue_key text; incident uuid; queued integer; local_now timestamp:=now() at time zone 'America/New_York'; deadline_hour integer; deadline timestamptz;
begin
 perform pg_advisory_xact_lock(hashtext('vq-feed-health'));
 foreach provider_name in array array['ESPN','ESPN injuries','ESPN news','The Odds API props'] loop
  select * into latest from public.feed_runs where provider=provider_name and created_at<=now() order by created_at desc limit 1;
  reason:=null;
  if latest.id is null then reason:='No verified refresh recorded';
  elsif latest.created_at<now()-interval '30 minutes' then reason:='Refresh older than 30 minutes';
  elsif latest.status not in ('ok','no upcoming events') then reason:=latest.status; end if;
  if reason is not null then issues:=issues||jsonb_build_array(jsonb_build_object('provider',provider_name,'reason',reason)); end if;
 end loop;
 deadline_hour:=case when local_now::time>=time '19:15' then 19 when local_now::time>=time '15:15' then 15 when local_now::time>=time '12:15' then 12 else null end;
 if deadline_hour is not null then
  deadline:=(local_now::date+make_time(deadline_hour,0,0)) at time zone 'America/New_York';
  if not exists(select 1 from public.research_feed_posts where created_at>=deadline and created_at<=now()) then
   issues:=issues||jsonb_build_array(jsonb_build_object('provider','Research publication','reason','Missing since '||deadline::text));
  end if;
 end if;
 if jsonb_array_length(issues)=0 then delete from private.feed_health_incident; return jsonb_build_object('issues',issues,'queued',0); end if;
 issue_key:=md5(issues::text);
 insert into private.feed_health_incident(singleton,issue_key,issues) values(true,issue_key,issues)
 on conflict(singleton) do update set issue_key=excluded.issue_key,issues=excluded.issues,
 incident_id=case when feed_health_incident.issue_key=excluded.issue_key then feed_health_incident.incident_id else gen_random_uuid() end,updated_at=now()
 returning incident_id into incident;
 insert into private.push_deliveries(subscription_id,kind,event_key)
 select s.id,'health','health:'||incident::text from public.push_subscriptions s join private.admin_users a on a.user_id=s.user_id
 where s.health_capable on conflict do nothing;
 get diagnostics queued=row_count;
 return jsonb_build_object('issues',issues,'queued',queued);
end $$;
revoke all on function private.check_source_health() from public,anon,authenticated;
select cron.schedule('vq-feed-health-check','*/5 * * * *','select private.check_source_health()');
