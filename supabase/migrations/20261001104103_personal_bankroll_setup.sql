-- Set a personal starting balance without recording or placing a wager.
-- Existing balances, entries and published challenge figures remain immutable.
create function private.start_personal_bankroll(p_challenge_id uuid,p_starting_cents integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); a public.personal_challenges;
begin
 if uid is null or not private.has_membership() or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null and (banned_until is null or banned_until<=now())) then raise exception 'Sign in with active research access'; end if;
 if p_starting_cents is null or p_starting_cents not between 1 and 100000000 then raise exception 'Enter a valid starting bankroll'; end if;
 if not exists(select 1 from public.challenges where id=p_challenge_id) then raise exception 'Challenge not found'; end if;
 -- Same account lock as recording a cash entry. Concurrent setup cannot reset an account.
 perform pg_advisory_xact_lock(hashtextextended(uid::text||p_challenge_id::text,0));
 select * into a from public.personal_challenges where user_id=uid and challenge_id=p_challenge_id for update;
 if found then
  if a.starting_cents<>p_starting_cents then raise exception 'Your starting bankroll is already recorded and cannot be overwritten'; end if;
 else
  insert into public.personal_challenges(user_id,challenge_id,starting_cents) values(uid,p_challenge_id,p_starting_cents) returning * into a;
 end if;
 return jsonb_build_object('id',a.id,'starting_cents',a.starting_cents);
end $$;
revoke all on function private.start_personal_bankroll(uuid,integer) from public,anon,authenticated;
grant execute on function private.start_personal_bankroll(uuid,integer) to authenticated;
create function public.start_personal_bankroll(p_challenge_id uuid,p_starting_cents integer) returns jsonb language sql security invoker set search_path='' as $$select private.start_personal_bankroll(p_challenge_id,p_starting_cents)$$;
revoke all on function public.start_personal_bankroll(uuid,integer) from public,anon,authenticated;
grant execute on function public.start_personal_bankroll(uuid,integer) to authenticated;
