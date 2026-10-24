-- Closed beta: existing accounts keep access; every subsequent auth account starts pending.
-- Serialize signup/backfill so an account cannot slip between them.
lock table auth.users in share row exclusive mode;
create table private.beta_applications (
 user_id uuid primary key references auth.users(id) on delete cascade,
 state text not null default 'pending' check(state in ('pending','approved','declined')),
 requested_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id) on delete set null,
 grandfathered boolean not null default false
);
alter table private.beta_applications enable row level security;
revoke all on private.beta_applications from public,anon,authenticated;
grant select on private.beta_applications to service_role;
create table private.beta_application_reviews (
 id uuid primary key default gen_random_uuid(),
 user_id uuid references auth.users(id) on delete cascade,
 reviewer_id uuid references auth.users(id) on delete set null,
 decision text not null check(decision in ('approved','declined')),
 created_at timestamptz not null default now()
);
alter table private.beta_application_reviews enable row level security;
revoke all on private.beta_application_reviews from public,anon,authenticated;
grant select on private.beta_application_reviews to service_role;
insert into private.beta_applications(user_id,state,reviewed_at,grandfathered)
 select id,'approved',now(),true from auth.users;
create function private.create_beta_application() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into private.beta_applications(user_id) values(new.id);return new;end $$;
revoke all on function private.create_beta_application() from public,anon,authenticated;
create trigger beta_application_signup after insert on auth.users for each row execute function private.create_beta_application();

-- No authorization comes from user-editable metadata or stale JWT approval claims.
create function private.beta_approved(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.beta_applications a join auth.users u on u.id=a.user_id
 where a.user_id=p_user and a.state='approved' and u.email_confirmed_at is not null
 and (u.banned_until is null or u.banned_until<=now()))
$$;
revoke all on function private.beta_approved(uuid) from public,anon,authenticated;
create function private.beta_account_allowed() returns boolean language sql stable security definer set search_path='' as $$
 select private.beta_approved(auth.uid())
$$;
revoke all on function private.beta_account_allowed() from public,anon,authenticated;
grant execute on function private.beta_account_allowed() to authenticated;
create function private.beta_onboarding_complete(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u where u.id=p_user and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now()))
 and private.age_eligible(p_user)
 and exists(select 1 from public.community_profiles p where p.user_id=p_user and p.avatar is not null
 and p.username ~ '^[A-Za-z0-9_]{3,24}$' and p.username !~* '^Member_[a-f0-9]{8}$')
$$;
revoke all on function private.beta_onboarding_complete(uuid) from public,anon,authenticated;
create function private.beta_application_status() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('state',coalesce((select a.state from private.beta_applications a where a.user_id=auth.uid()),'pending'),
 'approved',private.beta_account_allowed(),'onboarding_complete',private.beta_onboarding_complete(auth.uid()),
 'requested_at',(select requested_at from private.beta_applications where user_id=auth.uid()))
$$;
revoke all on function private.beta_application_status() from public,anon,authenticated;
grant execute on function private.beta_application_status() to authenticated;
create function public.beta_application_status() returns jsonb language sql security invoker stable set search_path='' as $$select private.beta_application_status()$$;
revoke all on function public.beta_application_status() from public,anon,authenticated;
grant execute on function public.beta_application_status() to authenticated;

create function private.admin_beta_applications(p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Verified administrator required' using errcode='42501';end if;
 return jsonb_build_object('pending',(select count(*) from private.beta_applications where state='pending'),
 'applications',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (
 select a.user_id,a.state,a.requested_at,u.email,p.username,
 u.email_confirmed_at is not null as email_confirmed,private.beta_onboarding_complete(a.user_id) as ready
 from private.beta_applications a join auth.users u on u.id=a.user_id
 left join public.community_profiles p on p.user_id=a.user_id where a.state='pending'
 order by a.requested_at,a.user_id limit 50 offset greatest(0,least(coalesce(p_page,0),100000))*50)t));
end $$;
create function private.review_beta_application(p_user uuid,p_decision text) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_state text;
begin
 if not private.is_admin() then raise exception 'Verified administrator required' using errcode='42501';end if;
 if p_decision is null or p_decision not in ('approved','declined') then raise exception 'Invalid decision';end if;
 if p_user=auth.uid() or exists(select 1 from private.admin_users where user_id=p_user) then raise exception 'Administrator accounts cannot be reviewed here';end if;
 select state into current_state from private.beta_applications where user_id=p_user for update;
 if current_state is distinct from 'pending' then raise exception 'Application is no longer pending';end if;
 if p_decision='approved' and not private.beta_onboarding_complete(p_user) then raise exception 'Applicant must confirm email and complete profile and required age verification first';end if;
 update private.beta_applications set state=p_decision,reviewed_at=now(),reviewed_by=auth.uid() where user_id=p_user;
 insert into private.beta_application_reviews(user_id,reviewer_id,decision) values(p_user,auth.uid(),p_decision);
 return jsonb_build_object('state',p_decision);
end $$;
revoke all on function private.admin_beta_applications(integer),private.review_beta_application(uuid,text) from public,anon,authenticated;
grant execute on function private.admin_beta_applications(integer),private.review_beta_application(uuid,text) to authenticated;
create function public.admin_beta_applications(p_page integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$select private.admin_beta_applications(p_page)$$;
create function public.review_beta_application(p_user uuid,p_decision text) returns jsonb language sql security invoker set search_path='' as $$select private.review_beta_application(p_user,p_decision)$$;
revoke all on function public.admin_beta_applications(integer),public.review_beta_application(uuid,text) from public,anon,authenticated;
grant execute on function public.admin_beta_applications(integer),public.review_beta_application(uuid,text) to authenticated;

-- Member table operations require approval, including direct Data API calls. Onboarding,
-- notification preferences and deletion remain accessible under their existing owner/age policies.
do $$declare t record;begin
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and c.relrowsecurity and c.relname not in
 ('community_profiles','onboarding_events','notification_preferences','alert_preferences','push_subscriptions','member_phone_contacts','account_deletion_requests') loop
 execute format('create policy beta_approved_account on public.%I as restrictive for all to authenticated using((select private.beta_account_allowed())) with check((select private.beta_account_allowed()))',t.relname);
 end loop;
end $$;
-- Anonymous public previews stay public. Pending users cannot use private storage/community.
create policy beta_approved_storage on storage.objects as restrictive for all to authenticated
 using((select private.beta_account_allowed())) with check((select private.beta_account_allowed()));

-- Definer RPCs bypass RLS. Preserve original bodies/ACLs and interpose approval on each member
-- entry point, including RETURNS TABLE/SETOF entry points. Onboarding/status/public-preview/admin
-- helpers are explicitly excluded. Public-schema definer functions were separately reviewed:
-- begin_community_photo/share_member_parlay depend on guarded membership/owned rows;
-- preflight_nfl_selection/restrict_community_member/enable_health_push enforce admin checks;
-- nba_grade uses public grading data; request/cancel_account_deletion_request preserve self-service.
-- Future public definer entry points require an explicit approval/access review as well.
-- Pending authenticated users intentionally see less than anonymous public-preview visitors;
-- their boundary exposes onboarding/status/account controls until approved.
do $$declare f record;args text;oldname text;body text;begin
 for f in select p.oid,p.proname,p.prorettype,p.proretset,pg_get_function_arguments(p.oid) declaration,
 pg_get_function_identity_arguments(p.oid) identity,pg_get_function_result(p.oid) result
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'
 and p.prosecdef and has_function_privilege('authenticated',p.oid,'EXECUTE') and p.prorettype<>'trigger'::regtype
 and p.proname not like 'beta_%' and p.proname not in
 ('age_member_allowed','age_verification_status','is_admin','membership_status','public_overview','public_research_status',
 'push_public_key','register_push','admin_beta_applications','review_beta_application') loop
 oldname='before_beta_'||f.proname;
 select coalesce(string_agg('$'||i,','),'') into args from generate_series(1,(select pronargs from pg_proc where oid=f.oid))i;
 execute replace(pg_get_functiondef(f.oid),'FUNCTION private.'||f.proname||'(','FUNCTION private.'||oldname||'(');
 execute format('revoke all on function private.%I(%s) from public,anon,authenticated',oldname,f.identity);
 if f.result='boolean' and f.proname='community_member_allowed' then
 body=format('begin return private.beta_account_allowed() and private.beta_approved($1) and private.%I(%s);end',oldname,args);
 elsif f.result='boolean' then
 body=format('begin return private.beta_account_allowed() and private.%I(%s);end',oldname,args);
 else
 body=format('begin if auth.uid() is not null and not private.beta_account_allowed() then raise exception ''Account approval required'' using errcode=''42501'';end if;%s end',
 case when f.proretset then format('return query select * from private.%I(%s);return;',oldname,args)
 when f.result='void' then format('perform private.%I(%s);return;',oldname,args) else format('return private.%I(%s);',oldname,args)end);
 end if;
 execute format('create or replace function private.%I(%s) returns %s language plpgsql security definer set search_path='''' as %L',f.proname,f.declaration,f.result,body);
 end loop;
end $$;
-- Add approval state to the existing status without replacing membership/trial/age semantics.
create function private.before_beta_membership_status() returns jsonb language sql stable security definer set search_path='' as $$select '{}'::jsonb$$;
do $$begin execute replace(pg_get_functiondef('private.membership_status()'::regprocedure),'FUNCTION private.membership_status(','FUNCTION private.before_beta_membership_status(');end $$;
revoke all on function private.before_beta_membership_status() from public,anon,authenticated;
create or replace function private.membership_status() returns jsonb language sql stable security definer set search_path='' as $$
 select private.before_beta_membership_status()||jsonb_build_object('approval_required',auth.uid() is not null and not private.beta_account_allowed(),
 'approval_state',coalesce((select state from private.beta_applications where user_id=auth.uid()),'pending'))
$$;
-- Server-side checkout must not accept payment as a way around the testing queue.
create function private.beta_checkout_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin if not private.beta_approved(new.user_id) then raise exception 'Account approval required before checkout';end if;return new;end $$;
revoke all on function private.beta_checkout_guard() from public,anon,authenticated;
create trigger beta_checkout_guard before insert on private.billing_orders for each row execute function private.beta_checkout_guard();
-- Notification producers must not leak member research to a pending account.
create function private.beta_push_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid;begin
 select user_id into recipient from public.push_subscriptions where id=new.subscription_id;
 if new.kind in ('official','candidate','research','price') and not private.beta_approved(recipient) then return null;end if;
 return new;
end $$;
revoke all on function private.beta_push_guard() from public,anon,authenticated;
create trigger beta_push_guard before insert on private.push_deliveries for each row execute function private.beta_push_guard();
-- Service dispatch checks approval again at delivery time. Security/account messages remain
-- available while an application is pending; social/research content does not.
do $$declare original text;updated text;begin
 if to_regprocedure('public.social_notification_delivery_allowed(uuid,uuid)') is not null then
  original:=pg_get_functiondef('public.social_notification_delivery_allowed(uuid,uuid)'::regprocedure);
  updated:=replace(original,'where d.id=p_id and', 'where (private.beta_approved(n.recipient_id) or n.type in (''welcome'',''profile_reminder'',''security'',''password_change'',''account'')) and d.id=p_id and');
  if updated=original then raise exception 'Social notification delivery guard changed; review required';end if;
  execute updated;
 end if;
end $$;
