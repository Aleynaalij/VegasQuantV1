-- Owner-entered adjustments preserve starting balance and wager P/L separately.
create table public.personal_bankroll_adjustments (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 personal_challenge_id uuid not null references public.personal_challenges(id),
 delta_cents bigint not null check(delta_cents<>0),
 balance_before_cents bigint not null,
 balance_after_cents bigint not null check(balance_after_cents between 0 and 100000000),
 reason text not null check(reason in ('Deposit','Withdrawal','Balance correction')),
 created_at timestamptz not null default now(),
 check(balance_after_cents=balance_before_cents+delta_cents)
);
create index personal_adjustments_account_idx on public.personal_bankroll_adjustments(personal_challenge_id,created_at);
create index personal_adjustments_user_idx on public.personal_bankroll_adjustments(user_id);
alter table public.personal_bankroll_adjustments enable row level security;
revoke all on public.personal_bankroll_adjustments from public,anon,authenticated;
grant select on public.personal_bankroll_adjustments to authenticated;
create policy owner_read on public.personal_bankroll_adjustments for select to authenticated using (user_id=(select auth.uid()) or (select private.is_admin()));
create trigger prevent_rewrite before update or delete on public.personal_bankroll_adjustments for each row execute function private.immutable();
create function private.update_personal_bankroll(p_account_id uuid,p_balance_cents bigint,p_expected_cents bigint,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); a public.personal_challenges; current_balance bigint; reserved bigint; rid uuid;
begin
 if uid is null or not private.has_membership() or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null and (banned_until is null or banned_until<=now())) then raise exception 'Sign in with active research access'; end if;
 select * into a from public.personal_challenges where id=p_account_id and user_id=uid;
 if not found then raise exception 'Personal bankroll not found'; end if;
 if p_balance_cents is null or p_balance_cents not between 0 and 100000000 or p_expected_cents is null or p_reason is null or p_reason not in ('Deposit','Withdrawal','Balance correction') then raise exception 'Enter a valid balance and reason'; end if;
 -- Match publication/entry lock order and wait for pending settlement/corrections.
 perform 1 from public.official_picks p join public.challenge_stages s on s.id=p.stage_id where s.challenge_id=a.challenge_id order by p.id for update of p;
 perform 1 from public.personal_entries e where e.personal_challenge_id=a.id order by e.id for update;
 perform pg_advisory_xact_lock(hashtextextended(uid::text||a.challenge_id::text,0));
 perform 1 from public.personal_challenges where id=a.id for update;
 select a.starting_cents+coalesce(sum(e.profit_cents),0)+(select coalesce(sum(b.delta_cents),0) from public.personal_bankroll_adjustments b where b.personal_challenge_id=a.id),coalesce(sum(case when e.result is null then e.stake_cents else 0 end),0) into current_balance,reserved from public.personal_entry_state e where e.personal_challenge_id=a.id;
 if current_balance<>p_expected_cents then raise exception 'Your balance changed. Refresh and try again.'; end if;
 if p_balance_cents<reserved then raise exception 'Balance must cover funds already in play'; end if;
 if p_balance_cents=current_balance then return null; end if;
 if p_reason='Deposit' and p_balance_cents<current_balance or p_reason='Withdrawal' and p_balance_cents>current_balance then raise exception 'Choose the matching adjustment reason'; end if;
 insert into public.personal_bankroll_adjustments(user_id,personal_challenge_id,delta_cents,balance_before_cents,balance_after_cents,reason) values(uid,a.id,p_balance_cents-current_balance,current_balance,p_balance_cents,p_reason) returning id into rid;
 return rid;
end $$;
revoke all on function private.update_personal_bankroll(uuid,bigint,bigint,text) from public,anon,authenticated;
grant execute on function private.update_personal_bankroll(uuid,bigint,bigint,text) to authenticated;
create function public.update_personal_bankroll(p_account_id uuid,p_balance_cents bigint,p_expected_cents bigint,p_reason text) returns uuid language sql security invoker set search_path='' as $$select private.update_personal_bankroll(p_account_id,p_balance_cents,p_expected_cents,p_reason)$$;
revoke all on function public.update_personal_bankroll(uuid,bigint,bigint,text) from public,anon,authenticated;
grant execute on function public.update_personal_bankroll(uuid,bigint,bigint,text) to authenticated;
-- Keep existing entry and correction authorization; include adjustments in cash checks.
do $$ declare f record; definition text; begin
 for f in select oid from pg_proc where pronamespace='private'::regnamespace and proname in ('record_personal_entry','review_entry_correction') loop
  definition:=pg_get_functiondef(f.oid);
  if position('a.starting_cents+coalesce' in definition)=0 then raise exception 'Expected bankroll expression not found'; end if;
  definition:=replace(definition,'a.starting_cents+coalesce','a.starting_cents+(select coalesce(sum(b.delta_cents),0) from public.personal_bankroll_adjustments b where b.personal_challenge_id=a.id)+coalesce');
  definition:=replace(definition,'group by a.starting_cents;','group by a.id,a.starting_cents;');
  execute definition;
 end loop;
end $$;
