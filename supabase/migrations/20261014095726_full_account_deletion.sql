-- Service-only erasure leases. No public client can authorize account erasure.
create table private.account_erasure_jobs (
 user_id uuid primary key references auth.users(id) on delete cascade,
 lease_id uuid not null default gen_random_uuid(),ready boolean not null default false,
 expires_at timestamptz not null default (now()+interval '10 minutes')
);
alter table private.account_erasure_jobs enable row level security;
revoke all on private.account_erasure_jobs from public,anon,authenticated;
create policy erasure_jobs_deny_direct on private.account_erasure_jobs for all to anon,authenticated using(false) with check(false);

create function private.begin_account_erasure(p_user uuid,p_session uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare lease uuid;begin
 perform 1 from auth.users where id=p_user for update;
 if not found then raise exception 'Account unavailable';end if;
 if not exists(select 1 from auth.sessions where id=p_session and user_id=p_user and (not_after is null or not_after>now())) then raise exception 'Sign in again before deleting';end if;
 if exists(select 1 from private.admin_users where user_id=p_user) then raise exception 'Transfer administrator access before deleting this account';end if;
 if exists(select 1 from storage.objects where owner_id=p_user::text) then raise exception 'Account contains storage objects requiring cleanup';end if;
 if exists(select 1 from private.billing_orders where user_id=p_user and state='pending' and checkout_id is null and created_at>now()-interval '31 minutes') then raise exception 'Checkout is initializing; wait for it to finish or expire before deleting';end if;
 insert into private.account_erasure_jobs(user_id) values(p_user) on conflict(user_id) do update set lease_id=gen_random_uuid(),ready=false,expires_at=now()+interval '10 minutes' where account_erasure_jobs.expires_at<now() returning lease_id into lease;
 if lease is null then raise exception 'Deletion is already in progress';end if;
 update public.account_deletion_requests set status='processing' where user_id=p_user and status='pending';
 return jsonb_build_object('lease',lease,'orders',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'checkout_id',checkout_id)),'[]') from private.billing_orders where user_id=p_user),'subscriptions',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'customer_id',customer_id,'order_id',order_id)),'[]') from private.billing_subscriptions where user_id=p_user));
end $$;
create function public.begin_account_erasure(p_user uuid,p_session uuid) returns jsonb language sql security invoker set search_path='' as $$select private.begin_account_erasure(p_user,p_session)$$;
create function private.authorize_account_erasure(p_user uuid,p_lease uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update private.account_erasure_jobs set ready=true where user_id=p_user and lease_id=p_lease and expires_at>now();
 if not found then raise exception 'Deletion authorization expired';end if;
end $$;
create function public.authorize_account_erasure(p_user uuid,p_lease uuid) returns void language sql security invoker set search_path='' as $$select private.authorize_account_erasure(p_user,p_lease)$$;
create function private.release_account_erasure(p_user uuid,p_lease uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 delete from private.account_erasure_jobs where user_id=p_user and lease_id=p_lease;
 if found then update public.account_deletion_requests set status='pending' where user_id=p_user and status='processing';end if;
end $$;
create function public.release_account_erasure(p_user uuid,p_lease uuid) returns void language sql security invoker set search_path='' as $$select private.release_account_erasure(p_user,p_lease)$$;
create function private.billing_order_present(p_order uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from private.billing_orders where id=p_order)$$;
create function public.billing_order_present(p_order uuid) returns boolean language sql stable security invoker set search_path='' as $$select private.billing_order_present(p_order)$$;
do $$declare f text;begin
 foreach f in array array['begin_account_erasure(uuid,uuid)','authorize_account_erasure(uuid,uuid)','release_account_erasure(uuid,uuid)','billing_order_present(uuid)'] loop
 execute 'revoke all on function private.'||f||' from public,anon,authenticated';
 execute 'revoke all on function public.'||f||' from public,anon,authenticated';
 execute 'grant execute on function private.'||f||' to service_role';
 execute 'grant execute on function public.'||f||' to service_role';
 end loop;
end $$;

-- Serialize checkout creation with erasure preflight. Existing pending checkouts
-- are collected/expired before erasure; no new order may appear during the lease.
create function private.guard_billing_during_erasure() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from auth.users where id=new.user_id for update;
 if exists(select 1 from private.account_erasure_jobs where user_id=new.user_id and expires_at>now()) then raise exception 'Account deletion is in progress';end if;
 return new;
end $$;
revoke all on function private.guard_billing_during_erasure() from public,anon,authenticated;
create trigger billing_erasure_guard before insert on private.billing_orders for each row execute function private.guard_billing_during_erasure();

-- Narrow exception only for the deleting member's own private tracking rows.
-- Official publication/result immutability is never relaxed.
create function private.personal_immutable_or_erasure() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='DELETE' and current_user='postgres' and current_setting('vq.erasing_user',true)=old.user_id::text then return old;end if;
 raise exception 'Personal tracking history is immutable outside verified account erasure';
end $$;
revoke all on function private.personal_immutable_or_erasure() from public,anon,authenticated;
do $$declare t text;begin
 foreach t in array array['personal_challenges','personal_entries','personal_settlements','personal_correction_requests','personal_correction_decisions','personal_bankroll_adjustments'] loop
 execute format('drop trigger prevent_rewrite on public.%I',t);
 execute format('create trigger prevent_rewrite before update or delete on public.%I for each row execute function private.personal_immutable_or_erasure()',t);
 end loop;
 drop trigger checkins_immutable on public.challenge_checkins;
 create trigger checkins_immutable before update or delete on public.challenge_checkins for each row execute function private.personal_immutable_or_erasure();
end $$;

-- Supabase Auth's deleteUser transaction invokes this trigger. Any failure rolls
-- back all app-data cleanup and the auth deletion together. It does not delete
-- published analyst research, official results or another member's records.
create function private.erase_member_dependencies() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from private.account_erasure_jobs where user_id=old.id and ready and expires_at>now()) then raise exception 'Verified erasure authorization required';end if;
 if exists(select 1 from private.admin_users where user_id=old.id) then raise exception 'Transfer administrator access before deletion';end if;
 perform set_config('vq.erasing_user',old.id::text,true);
 delete from public.personal_correction_decisions where user_id=old.id;
 delete from public.personal_correction_requests where user_id=old.id;
 delete from public.personal_settlements where user_id=old.id;
 delete from public.personal_bankroll_adjustments where user_id=old.id;
 delete from public.personal_run_events where user_id=old.id;
 delete from public.personal_entries where user_id=old.id;
 delete from public.personal_challenges where user_id=old.id;
 delete from public.challenge_checkins where user_id=old.id;
 delete from public.challenge_runs where user_id=old.id;
 delete from public.community_profiles where user_id=old.id;
 delete from private.push_deliveries where event_key='signup:'||old.id::text;
 delete from private.billing_invoices where subscription_id in(select id from private.billing_subscriptions where user_id=old.id);
 delete from private.billing_subscriptions where user_id=old.id;
 delete from private.billing_events where order_id in(select id from private.billing_orders where user_id=old.id);
 delete from private.friend_redemptions where user_id=old.id;
 delete from private.memberships where user_id=old.id;
 delete from private.billing_orders where user_id=old.id;
 delete from private.promo_attempts where user_id=old.id;
 -- All remaining owned social/preferences/phone/push/erasure rows have audited
 -- ON DELETE CASCADE user FKs. Auth also cascades identities and refresh sessions.
 perform set_config('vq.erasing_user','',true);
 return old;
end $$;
revoke all on function private.erase_member_dependencies() from public,anon,authenticated,service_role;
create trigger erase_member_application_data before delete on auth.users for each row execute function private.erase_member_dependencies();
