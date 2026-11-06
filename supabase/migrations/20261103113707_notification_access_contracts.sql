-- Preserve the existing live-pick audience and external consent at every read/delivery boundary.
begin;
create function private.pick_notification_recipient_allowed(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.age_eligible(p_user)
 and exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null)
 and not exists(select 1 from private.account_erasure_jobs where user_id=p_user and expires_at>now())
 and (exists(select 1 from private.admin_users where user_id=p_user)
 or exists(select 1 from private.memberships where user_id=p_user and revoked_at is null and starts_at<=now() and expires_at>now())
 or exists(select 1 from private.billing_subscriptions where user_id=p_user and not blocked and paid_until>now()));
$$;
revoke all on function private.pick_notification_recipient_allowed(uuid) from public,anon,authenticated;
create function private.pick_notification_inbox_allowed() returns boolean
language sql stable security definer set search_path='' as $$
 select private.age_member_allowed() and private.pick_notification_recipient_allowed(auth.uid());
$$;
revoke all on function private.pick_notification_inbox_allowed() from public,anon,authenticated;
grant execute on function private.pick_notification_inbox_allowed() to authenticated;
create policy notification_pick_contract on public.notifications as restrictive for select to authenticated
using(type<>'pick' or (select private.pick_notification_inbox_allowed()));

-- Exact source anchors fail closed on incompatible definitions; retain existing function grants.
do $$declare definition text;old text;begin
 select pg_get_functiondef('private.emit_notification(uuid,uuid,text,text,uuid,uuid,uuid,text,text)'::regprocedure) into definition;
 old:='if p_recipient is null or p_recipient=p_actor then return null;end if;';
 if position(old in definition)=0 then raise exception 'Emitter contract changed; review integration';end if;
 definition:=replace(definition,old,old||E'\n if p_type=''pick'' and not private.pick_notification_recipient_allowed(p_recipient) then return null;end if;');
 old:='if p_type=any(prefs.disabled_types) then return null;end if;';
 if position(old in definition)=0 then raise exception 'Preference contract changed; review integration';end if;
 -- Security/account inbox notices are always available, including with preexisting preferences.
 -- Queue claim and final dispatch still honor external-channel and per-type consent unchanged.
 definition:=replace(definition,old,'if p_type=any(prefs.disabled_types) and p_type not in (''security'',''password_change'',''account'') then return null;end if;');
 execute definition;
 select pg_get_functiondef('public.claim_social_notification_deliveries()'::regprocedure) into definition;
 old:='and (n.actor_id is null or private.age_eligible(n.recipient_id))';
 if position(old in definition)=0 then raise exception 'Claim contract changed; review integration';end if;
 definition:=replace(definition,old,old||' and (n.type<>''pick'' or private.pick_notification_recipient_allowed(n.recipient_id))');
 old:='select array_agg(id) into jobs';
 if position(old in definition)=0 then raise exception 'Claim scheduling contract changed; review integration';end if;
 -- Suppression/expiry above runs first. Defer only unowned or expired leases;
 -- preserve attempts and ownership of active leases and permit later eligibility recovery.
 definition:=replace(definition,old,$backoff$
 update private.notification_deliveries d set due_at=now()+interval '5 minutes'
 from public.notifications n where d.notification_id=n.id
 and (d.state='pending' or(d.state='leased' and d.lease_until<now()))
 and d.due_at<=now() and d.attempts<5 and n.type='pick'
 and private.pick_notification_recipient_allowed(n.recipient_id) is distinct from true;
 select array_agg(id) into jobs$backoff$);
 execute definition;
 select pg_get_functiondef('public.social_notification_delivery_allowed(uuid,uuid)'::regprocedure) into definition;
 old:='and n.type<>all(p.disabled_types)';
 if position(old in definition)=0 then raise exception 'Dispatch contract changed; review integration';end if;
 execute replace(definition,old,old||' and (n.type<>''pick'' or private.pick_notification_recipient_allowed(n.recipient_id))');
end$$;
commit;
