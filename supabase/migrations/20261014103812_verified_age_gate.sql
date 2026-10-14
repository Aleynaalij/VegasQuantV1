-- Roll out only after live provider setup, consent review and acceptance tests.
create table private.age_policy (
 singleton boolean primary key default true check(singleton),
 enforced boolean not null default false,
 version integer not null default 1 check(version>0)
);
insert into private.age_policy default values;
create table private.age_checks (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 provider_session text unique,
 state text not null default 'pending' check(state in ('pending','requires_input','processing','verified','underage','needs_review','canceled')),
 policy_version integer not null,
 consent_version text not null,
 created_at timestamptz not null default now(),
 checked_at timestamptz
);
create index age_checks_user_created on private.age_checks(user_id,created_at desc);
alter table private.age_policy enable row level security;
alter table private.age_checks enable row level security;
revoke all on private.age_policy,private.age_checks from public,anon,authenticated;
create policy age_policy_deny on private.age_policy for all to anon,authenticated using(false) with check(false);
create policy age_checks_deny on private.age_checks for all to anon,authenticated using(false) with check(false);

create function private.age_eligible(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.age_checks c,private.age_policy p where p.singleton and c.user_id=p_user and c.state='verified' and c.policy_version=p.version)
 or (not (select enforced from private.age_policy where singleton) and not exists(select 1 from private.age_checks c where c.user_id=p_user and c.state='underage'))
$$;
revoke all on function private.age_eligible(uuid) from public,anon,authenticated;
create function private.age_member_allowed() returns boolean language sql stable security definer set search_path='' as $$select private.age_eligible(auth.uid()) and (not (select enforced from private.age_policy where singleton) or exists(select 1 from auth.sessions where user_id=auth.uid() and id=(auth.jwt()->>'session_id')::uuid and (not_after is null or not_after>now())))$$;
revoke all on function private.age_member_allowed() from public;
grant execute on function private.age_member_allowed() to anon,authenticated;
create function private.age_verification_status() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('required',p.enforced or exists(select 1 from private.age_checks c where c.user_id=auth.uid() and c.state='underage'),'verified',private.age_member_allowed() and exists(select 1 from private.age_checks c where c.user_id=auth.uid() and c.state='verified' and c.policy_version=p.version),'state',coalesce((select state from private.age_checks c where c.user_id=auth.uid() and c.policy_version=p.version order by created_at desc limit 1),'pending'),'version',p.version,'retry_after',(select case when c.state in ('underage','needs_review') then c.checked_at+interval '1 day' end from private.age_checks c where c.user_id=auth.uid() and c.policy_version=p.version order by created_at desc limit 1)) from private.age_policy p where singleton
$$;
revoke all on function private.age_verification_status() from public,anon;
grant execute on function private.age_verification_status() to authenticated;
create function public.age_verification_status() returns jsonb language sql stable security invoker set search_path='' as $$select private.age_verification_status()$$;
revoke all on function public.age_verification_status() from public,anon;
grant execute on function public.age_verification_status() to authenticated;

create function private.begin_age_check(p_user uuid,p_session uuid,p_consent text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.age_checks;v integer;begin
 perform 1 from auth.users where id=p_user and email_confirmed_at is not null for update;
 if not found or not exists(select 1 from auth.sessions where id=p_session and user_id=p_user and (not_after is null or not_after>now())) then raise exception 'Live confirmed session required';end if;
 if exists(select 1 from private.account_erasure_jobs where user_id=p_user and expires_at>now()) then raise exception 'Account deletion in progress';end if;
 if p_consent<>'2026-10-14' then raise exception 'Current verification notice required';end if;
 select version into v from private.age_policy where singleton;
 if exists(select 1 from private.age_checks where user_id=p_user and policy_version=v and state='verified') then raise exception 'Verification already completed';end if;
 if exists(select 1 from private.age_checks where user_id=p_user and policy_version=v and state in ('underage','needs_review') and checked_at>now()-interval '1 day') then raise exception 'Review or a retry tomorrow is required';end if;
 select * into c from private.age_checks where user_id=p_user and policy_version=v and state in ('pending','requires_input','processing') order by created_at desc limit 1;
 if found then return to_jsonb(c);end if;
 if (select count(*) from private.age_checks where user_id=p_user and created_at>now()-interval '1 day')>=3 then raise exception 'Verification retry limit reached';end if;
 insert into private.age_checks(user_id,policy_version,consent_version) values(p_user,v,p_consent) returning * into c;
 return to_jsonb(c);
end $$;
create function private.bind_age_check(p_user uuid,p_attempt uuid,p_provider text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_provider!~'^vs_[A-Za-z0-9]+$' then raise exception 'Invalid provider reference';end if;
 update private.age_checks set provider_session=p_provider where id=p_attempt and user_id=p_user and (provider_session is null or provider_session=p_provider);
 if not found then raise exception 'Verification owner mismatch';end if;
end $$;
create function private.age_check_latest(p_user uuid) returns jsonb language sql stable security definer set search_path='' as $$select to_jsonb(c) from private.age_checks c where user_id=p_user and policy_version=(select version from private.age_policy where singleton) order by created_at desc limit 1$$;
create function private.finish_age_check(p_user uuid,p_attempt uuid,p_provider text,p_state text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_state not in ('requires_input','processing','verified','underage','needs_review','canceled') then raise exception 'Invalid verification result';end if;
 update private.age_checks set state=p_state,checked_at=now() where id=p_attempt and user_id=p_user and provider_session=p_provider and state not in ('verified','underage','needs_review');
 if not found and not exists(select 1 from private.age_checks where id=p_attempt and user_id=p_user and provider_session=p_provider and state=p_state) then raise exception 'Verification result mismatch';end if;
end $$;
create function private.age_check_sessions(p_user uuid) returns jsonb language sql stable security definer set search_path='' as $$select coalesce(jsonb_agg(jsonb_build_object('id',id,'provider_session',provider_session)),'[]') from private.age_checks where user_id=p_user and provider_session is not null$$;
create function private.age_session_live(p_user uuid,p_session uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from auth.sessions where id=p_session and user_id=p_user and (not_after is null or not_after>now()))$$;
revoke all on function private.age_session_live(uuid,uuid) from public,anon,authenticated;
grant execute on function private.age_session_live(uuid,uuid) to service_role;
create function public.age_session_live(p_user uuid,p_session uuid) returns boolean language sql stable security invoker set search_path='' as $$select private.age_session_live(p_user,p_session)$$;
revoke all on function public.age_session_live(uuid,uuid) from public,anon,authenticated;
grant execute on function public.age_session_live(uuid,uuid) to service_role;
do $$declare sig text;f record;begin
 foreach sig in array array['begin_age_check(uuid,uuid,text)','bind_age_check(uuid,uuid,text)','age_check_latest(uuid)','finish_age_check(uuid,uuid,text,text)','age_check_sessions(uuid)'] loop
 execute 'revoke all on function private.'||sig||' from public,anon,authenticated';
 execute 'grant execute on function private.'||sig||' to service_role';
 end loop;
end $$;
create function public.begin_age_check(p_user uuid,p_session uuid,p_consent text) returns jsonb language sql security invoker set search_path='' as $$select private.begin_age_check(p_user,p_session,p_consent)$$;
create function public.bind_age_check(p_user uuid,p_attempt uuid,p_provider text) returns void language sql security invoker set search_path='' as $$select private.bind_age_check(p_user,p_attempt,p_provider)$$;
create function public.age_check_latest(p_user uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.age_check_latest(p_user)$$;
create function public.finish_age_check(p_user uuid,p_attempt uuid,p_provider text,p_state text) returns void language sql security invoker set search_path='' as $$select private.finish_age_check(p_user,p_attempt,p_provider,p_state)$$;
create function public.age_check_sessions(p_user uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.age_check_sessions(p_user)$$;
do $$declare sig text;begin
 foreach sig in array array['begin_age_check(uuid,uuid,text)','bind_age_check(uuid,uuid,text)','age_check_latest(uuid)','finish_age_check(uuid,uuid,text,text)','age_check_sessions(uuid)'] loop
 execute 'revoke all on function public.'||sig||' from public,anon,authenticated';
 execute 'grant execute on function public.'||sig||' to service_role';
 end loop;
end $$;

-- A restrictive policy cannot be bypassed by an existing permissive policy.
-- Account deletion requests stay accessible; provider and billing management are
-- separately authenticated server endpoints. Service maintenance retains access.
do $$declare t record;begin
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity and c.relname<>'account_deletion_requests' loop
 execute format('create policy age_verified_account on public.%I as restrictive for all to authenticated using((select private.age_member_allowed())) with check((select private.age_member_allowed()))',t.relname);
 end loop;
end $$;

-- SECURITY DEFINER member RPCs bypass table RLS. Wrap them as well. Old
-- implementations remain private and cannot be called by members directly.
do $$declare f record;args text;result text;oldname text;body text;begin
 for f in select p.oid,p.proname,p.prorettype,pg_get_function_arguments(p.oid) declaration,pg_get_function_identity_arguments(p.oid) identity,pg_get_function_result(p.oid) result,has_function_privilege('anon',p.oid,'EXECUTE') anon_allowed from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname in ('is_admin','has_membership','check_in_challenge','set_challenge_run','record_personal_entry','grade_personal_entry','start_personal_bankroll','update_personal_bankroll','request_entry_correction','review_entry_correction','redeem_friend_pass','register_push','community_member','community_roster','leg_tail_count') loop
 select coalesce(string_agg('$'||i,','),'') into args from generate_series(1,(select pronargs from pg_proc where oid=f.oid)) i;
 oldname='before_age_'||f.proname;
 execute replace(pg_get_functiondef(f.oid),'FUNCTION private.'||f.proname||'(','FUNCTION private.'||oldname||'(');
 execute format('revoke all on function private.%I(%s) from public,anon,authenticated',oldname,f.identity);
 if f.proname in ('is_admin','has_membership') then
 body=format('begin return private.age_member_allowed() and private.%I(%s);end',oldname,args);
 else
 body=format('begin if auth.uid() is not null and not private.age_member_allowed() then raise exception ''Age verification required'';end if;%s end',case when f.result='void' then format('perform private.%I(%s);return;',oldname,args) else format('return private.%I(%s);',oldname,args) end);
 end if;
 execute format('create or replace function private.%I(%s) returns %s language plpgsql security definer set search_path='''' as %L',f.proname,f.declaration,f.result,body);
 execute format('revoke all on function private.%I(%s) from public,anon,authenticated',f.proname,f.identity);
 execute format('grant execute on function private.%I(%s) to authenticated',f.proname,f.identity);
 if f.anon_allowed then execute format('grant execute on function private.%I(%s) to anon',f.proname,f.identity);end if;
 end loop;
end $$;

-- Checkout's service-role path must also reject an unverified account.
create function private.age_checkout_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin if not private.age_eligible(new.user_id) then raise exception 'Age verification required before checkout';end if;return new;end $$;
revoke all on function private.age_checkout_guard() from public,anon,authenticated;
create trigger age_checkout_guard before insert on private.billing_orders for each row execute function private.age_checkout_guard();

-- A member who still needs verification must not receive research pick alerts.
create function private.age_push_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid;begin
 select user_id into recipient from public.push_subscriptions where id=new.subscription_id;
 if new.kind in ('official','candidate','research') and not private.age_eligible(recipient) then return null;end if;
 return new;
end $$;
revoke all on function private.age_push_guard() from public,anon,authenticated;
create trigger age_push_guard before insert on private.push_deliveries for each row execute function private.age_push_guard();
create function private.age_push_delivery_allowed(p_delivery uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select d.kind not in ('official','research') or private.age_eligible(s.user_id) from private.push_deliveries d join public.push_subscriptions s on s.id=d.subscription_id where d.id=p_delivery),false)
$$;
revoke all on function private.age_push_delivery_allowed(uuid) from public,anon,authenticated;
grant execute on function private.age_push_delivery_allowed(uuid) to service_role;
create function public.age_push_delivery_allowed(p_delivery uuid) returns boolean language sql stable security invoker set search_path='' as $$select private.age_push_delivery_allowed(p_delivery)$$;
revoke all on function public.age_push_delivery_allowed(uuid) from public,anon,authenticated;
grant execute on function public.age_push_delivery_allowed(uuid) to service_role;
