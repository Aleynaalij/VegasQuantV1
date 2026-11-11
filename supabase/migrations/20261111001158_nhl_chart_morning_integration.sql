-- Immutable research payloads; only the initial publication marker can be appended.
create function private.nhl_chart_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'NHL chart snapshots are immutable';end if;
 if (new.id,new.game_id,new.day,new.payload,new.captured_at) is distinct from (old.id,old.game_id,old.day,old.payload,old.captured_at)
  or (old.post_id is not null and (new.post_id,new.posted_at) is distinct from (old.post_id,old.posted_at)) then raise exception 'NHL chart snapshots are immutable';end if;
 return new;
end $$;
revoke all on function private.nhl_chart_immutable() from public,anon,authenticated,service_role;
create trigger nhl_chart_immutable before update or delete on private.nhl_chart_snapshots for each row execute function private.nhl_chart_immutable();

create table private.nhl_chart_runs(id bigint generated always as identity primary key,ran_at timestamptz not null default clock_timestamp(),outcome jsonb not null);
alter table private.nhl_chart_runs enable row level security;
revoke all on private.nhl_chart_runs from public,anon,authenticated,service_role;
create function private.nhl_charts_run() returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
 if current_user<>'postgres' or session_user<>'postgres' then raise exception 'Server publisher required';end if;
 begin
  r:=private.nhl_charts_tick();
 exception when others then r:=jsonb_build_object('status','FAILED','reason',left(sqlerrm,240));
 end;
 insert into private.nhl_chart_runs(outcome) values(r);
 return r;
end $$;
revoke all on function private.nhl_charts_run() from public,anon,authenticated,service_role;

-- Append the chart tick to the existing NHL context job. Its cron/user/HTTP call stay unchanged.
-- Apply only after the chart renderer is deployed. No second scheduler or paid data request.
do $integration$
declare j record;
begin
 select * into j from cron.job where jobname='nhl-context-refresh';
 if not found or not j.active or j.username<>'postgres' or j.command not like '%/functions/v1/nhl-context%'
  or j.schedule<>'5,15,25,35,45,55 * * * *' then raise exception 'NHL context job changed; review integration';end if;
 if j.command like '%private.nhl_charts_run()%' then return;end if;
 perform cron.alter_job(j.jobid,command:=j.command||E'\nselect private.nhl_charts_run();');
end $integration$;
