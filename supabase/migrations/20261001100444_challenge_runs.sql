-- Participation is separate from all cash entries and memberships.
create table public.challenge_runs (
 user_id uuid not null references auth.users(id), challenge_id uuid not null references public.challenges(id),
 mode text not null check(mode in ('follow','track')), count_me boolean not null default false,
 joined_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(user_id,challenge_id)
);
create index challenge_runs_count on public.challenge_runs(challenge_id) where count_me;
alter table public.challenge_runs enable row level security;
revoke all on public.challenge_runs from public,anon,authenticated;
grant select on public.challenge_runs to authenticated;
create policy own_run on public.challenge_runs for select to authenticated using(user_id=(select auth.uid()) or (select private.is_admin()));
create table public.challenge_checkins (
 user_id uuid not null, challenge_id uuid not null, stage_number integer not null check(stage_number between 1 and 5),
 created_at timestamptz not null default now(),
 primary key(user_id,challenge_id,stage_number),
 foreign key(user_id,challenge_id) references public.challenge_runs(user_id,challenge_id)
);
alter table public.challenge_checkins enable row level security;
revoke all on public.challenge_checkins from public,anon,authenticated;
grant select on public.challenge_checkins to authenticated;
create policy own_checkins on public.challenge_checkins for select to authenticated using(user_id=(select auth.uid()) or (select private.is_admin()));
create trigger checkins_immutable before update or delete on public.challenge_checkins for each row execute function private.immutable();
-- Authenticated RPCs stamp ownership; they cannot write any betting/accounting tables.
create function private.set_challenge_run(p_challenge_id uuid,p_mode text,p_count_me boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.challenge_runs;
begin
 if auth.uid() is null then raise exception 'Sign in to join'; end if;
 if not exists(select 1 from auth.users where id=auth.uid() and (banned_until is null or banned_until<=now())) then raise exception 'Account unavailable'; end if;
 if not exists(select 1 from public.challenges where id=p_challenge_id) then raise exception 'Challenge not found'; end if;
 insert into public.challenge_runs(user_id,challenge_id,mode,count_me) values(auth.uid(),p_challenge_id,p_mode,p_count_me)
 on conflict(user_id,challenge_id) do update set mode=excluded.mode,count_me=excluded.count_me,updated_at=now() returning * into r;
 return to_jsonb(r);
end $$;
create function private.check_in_challenge(p_challenge_id uuid,p_stage_number integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.challenge_runs where user_id=auth.uid() and challenge_id=p_challenge_id) then raise exception 'Join this challenge first'; end if;
 if not exists(select 1 from public.challenge_stages s join public.challenges c on c.id=s.challenge_id where s.challenge_id=p_challenge_id and s.stage_number=p_stage_number and s.stage_number<=c.current_stage and s.status in ('OFFICIAL PLAY','WON','LOST','PUSH','PASS / PAUSED','COMPLETED')) then raise exception 'This stage is not ready to follow'; end if;
 insert into public.challenge_checkins(user_id,challenge_id,stage_number) values(auth.uid(),p_challenge_id,p_stage_number) on conflict do nothing;
end $$;
-- Deliberately public aggregate: only counts people who explicitly opt in; no identities or financial data.
create function private.challenge_community_count(p_challenge_id uuid) returns bigint language sql stable security definer set search_path='' as $$
 select count(*) from public.challenge_runs where challenge_id=p_challenge_id and count_me
$$;
revoke all on function private.set_challenge_run(uuid,text,boolean),private.check_in_challenge(uuid,integer),private.challenge_community_count(uuid) from public,anon,authenticated;
grant execute on function private.set_challenge_run(uuid,text,boolean),private.check_in_challenge(uuid,integer) to authenticated;
grant execute on function private.challenge_community_count(uuid) to anon,authenticated;
create function public.set_challenge_run(p_challenge_id uuid,p_mode text,p_count_me boolean) returns jsonb language sql security invoker set search_path='' as $$select private.set_challenge_run(p_challenge_id,p_mode,p_count_me)$$;
create function public.check_in_challenge(p_challenge_id uuid,p_stage_number integer) returns void language sql security invoker set search_path='' as $$select private.check_in_challenge(p_challenge_id,p_stage_number)$$;
create function public.challenge_community_count(p_challenge_id uuid) returns bigint language sql stable security invoker set search_path='' as $$select private.challenge_community_count(p_challenge_id)$$;
revoke all on function public.set_challenge_run(uuid,text,boolean),public.check_in_challenge(uuid,integer),public.challenge_community_count(uuid) from public,anon,authenticated;
grant execute on function public.set_challenge_run(uuid,text,boolean),public.check_in_challenge(uuid,integer) to authenticated;
grant execute on function public.challenge_community_count(uuid) to anon,authenticated;
