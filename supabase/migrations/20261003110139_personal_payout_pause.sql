-- Personal payout pauses are user-reported, append-only and never change grading.
create table public.personal_run_events (
 id bigint generated always as identity primary key,
 personal_challenge_id uuid not null references public.personal_challenges(id),
 user_id uuid not null default auth.uid() references auth.users(id),
 payout_pending boolean not null,
 created_at timestamptz not null default now()
);
create index personal_run_events_latest on public.personal_run_events(personal_challenge_id,id desc);
alter table public.personal_run_events enable row level security;
revoke all on public.personal_run_events from public,anon,authenticated;
grant select on public.personal_run_events to authenticated;
grant insert(personal_challenge_id,payout_pending) on public.personal_run_events to authenticated;
grant usage on sequence public.personal_run_events_id_seq to authenticated;
create policy owner_read on public.personal_run_events for select to authenticated using(user_id=(select auth.uid()));
create policy owner_append on public.personal_run_events for insert to authenticated with check(
 user_id=(select auth.uid()) and exists(select 1 from public.personal_challenges a where a.id=personal_challenge_id and a.user_id=(select auth.uid()))
);
-- Serialize pause/resume with the same account lock used by entry recording.
create function private.lock_personal_run_event() returns trigger language plpgsql security invoker set search_path='' as $$
declare a public.personal_challenges;
begin
 select * into a from public.personal_challenges where id=new.personal_challenge_id;
 if a.id is null or a.user_id is distinct from auth.uid() then raise exception 'Personal account not found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(a.user_id::text||a.challenge_id::text,0));
 return new;
end $$;
revoke all on function private.lock_personal_run_event() from public,anon,authenticated;
create trigger lock_run_event before insert on public.personal_run_events for each row execute function private.lock_personal_run_event();
create function private.require_cleared_personal_run() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if coalesce((select payout_pending from public.personal_run_events where personal_challenge_id=new.personal_challenge_id order by id desc limit 1),false) then
  raise exception 'Payout pending — your run is paused. Confirm funds have cleared before recording the next entry.';
 end if;
 return new;
end $$;
revoke all on function private.require_cleared_personal_run() from public,anon,authenticated;
create trigger require_cleared_run before insert on public.personal_entries for each row execute function private.require_cleared_personal_run();
