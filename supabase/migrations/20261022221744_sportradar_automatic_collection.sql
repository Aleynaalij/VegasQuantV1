-- Internal trial research collection. No member/public data or publication gate changes.
create table public.sportradar_runs (
 id uuid primary key default gen_random_uuid(), started_at timestamptz not null default now(),
 finished_at timestamptz, status text not null default 'running', calls int not null default 0,
 detail jsonb not null default '{}'::jsonb
);
create index sportradar_runs_time on public.sportradar_runs(started_at desc);
create table public.sportradar_snapshots (
 id uuid primary key default gen_random_uuid(), run_id uuid not null references public.sportradar_runs(id),
 game_id uuid, feed text not null check(feed in ('schedule','statistics','pbp')),
 source_url text not null check(source_url like 'https://api.sportradar.com/nfl/official/%'),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), retrieved_at timestamptz not null,
 provider_last_modified text, provider_date text, payload jsonb not null,
 access text not null check(access in ('trial','production')),
 unique(run_id,game_id,feed)
);
create index sportradar_snapshot_lookup on public.sportradar_snapshots(feed,retrieved_at desc);
alter table public.sportradar_runs enable row level security;
alter table public.sportradar_snapshots enable row level security;
revoke all on public.sportradar_runs,public.sportradar_snapshots from public,anon,authenticated,service_role;
grant select,insert,update on public.sportradar_runs to service_role;
grant select,insert on public.sportradar_snapshots to service_role;
-- Serialize claim and budget decisions across concurrent invocations. Invoker/service-only.
create function public.claim_sportradar_run() returns uuid language plpgsql security invoker set search_path='' as $$
declare r uuid;
begin
 perform pg_advisory_xact_lock(73488912);
 if exists(select 1 from public.sportradar_runs where started_at>now()-interval '4 minutes')
 or exists(select 1 from public.sportradar_runs where status='running' and started_at>now()-interval '10 minutes') then return null; end if;
 update public.sportradar_runs set status='interrupted',finished_at=now(),detail='{"error":"worker_timeout"}' where status='running';
 insert into public.sportradar_runs default values returning id into r;
 return r;
end $$;
create function public.reserve_sportradar_call(p_run uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(73488912);
 if not exists(select 1 from public.sportradar_runs where id=p_run and status='running' and calls<5 and started_at>now()-interval '3 minutes') then return false; end if;
 -- Local safety budgets, NOT an assertion about the owner's actual provider allowance.
 if (select coalesce(sum(calls),0) from public.sportradar_runs where started_at>now()-interval '24 hours')>=150
 or (select coalesce(sum(calls),0) from public.sportradar_runs where started_at>now()-interval '30 days')>=500 then return false; end if;
 update public.sportradar_runs set calls=calls+1 where id=p_run;
 return true;
end $$;
revoke all on function public.claim_sportradar_run(),public.reserve_sportradar_call(uuid) from public,anon,authenticated;
grant execute on function public.claim_sportradar_run(),public.reserve_sportradar_call(uuid) to service_role;
-- Dispatcher executes as the scheduler's postgres role, with the token only in Vault.
create function private.dispatch_sportradar_collection() returns bigint language sql security invoker set search_path='' as $$
 select net.http_post(url:='https://vegasquant.app/api/internal/sportradar',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='vq_sportradar_collector')),body:='{}'::jsonb,timeout_milliseconds:=120000);
$$;
revoke all on function private.dispatch_sportradar_collection() from public,anon,authenticated,service_role;
-- Activated after the matching production route is READY:
-- select cron.schedule('vq-sportradar-collection','*/5 * * * *','select private.dispatch_sportradar_collection();');
