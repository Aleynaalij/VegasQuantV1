create table private.memberships (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 season text not null check(season='2026'), plan text not null check(plan in ('full','half')),
 starts_at timestamptz not null default now(), expires_at timestamptz not null,
 revoked_at timestamptz, order_id uuid unique, created_at timestamptz not null default now(),
 check(expires_at>starts_at)
);
create index memberships_user_idx on private.memberships(user_id,expires_at);
create table private.billing_orders (
 id uuid primary key, user_id uuid not null references auth.users(id), plan text not null check(plan in ('full','half')),
 amount integer not null check(amount in (700,1000)), expires_at timestamptz not null,
 checkout_id text unique, payment_intent text unique, state text not null default 'pending' check(state in ('pending','paid','revoked')),
 created_at timestamptz not null default now()
);
create table private.billing_events (event_id text primary key, event_type text not null, order_id uuid, created_at timestamptz not null default now());
alter table private.memberships enable row level security;
alter table private.billing_orders enable row level security;
alter table private.billing_events enable row level security;
create policy no_direct_access on private.memberships for all to anon,authenticated using(false) with check(false);
create policy no_direct_access on private.billing_orders for all to anon,authenticated using(false) with check(false);
create policy no_direct_access on private.billing_events for all to anon,authenticated using(false) with check(false);

create function private.has_membership() returns boolean language sql stable security definer set search_path='' as $$
 select private.is_admin() or exists(select 1 from private.memberships where user_id=(select auth.uid()) and revoked_at is null and starts_at<=now() and expires_at>now());
$$;
revoke all on function private.has_membership() from public;
grant execute on function private.has_membership() to anon,authenticated;
grant usage on schema private to anon;
create function private.membership_status() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('allowed',private.has_membership(),'admin',private.is_admin(),'admin_account',exists(select 1 from private.admin_users where user_id=auth.uid()),'member_code',case when auth.uid() is not null then 'VQ-'||upper(substr(md5(auth.uid()::text),1,12)) else null end,'expires_at',(select max(expires_at) from private.memberships where user_id=auth.uid() and revoked_at is null and starts_at<=now() and expires_at>now()));
$$;
revoke all on function private.membership_status() from public;
grant execute on function private.membership_status() to anon,authenticated;
create function public.membership_status() returns jsonb language sql stable security invoker set search_path='' as $$ select private.membership_status(); $$;
revoke all on function public.membership_status() from public;
grant execute on function public.membership_status() to anon,authenticated;

do $$ declare t text; begin
 foreach t in array array['challenges','challenge_stages','market_snapshots','analysis_versions','official_picks','pick_entries','closing_lines','pick_results','process_reviews','bankroll_transactions','audit_events'] loop
 execute format('drop policy public_read on public.%I',t);
 execute format('create policy member_read on public.%I for select to anon,authenticated using ((select private.has_membership()))',t);
 end loop;
end $$;
-- Safe aggregate-only projection: no source snapshots, analysis, selections, or reasons.
create function private.public_overview() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('challenges',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'number',c.number,'status',c.status,'current_stage',c.current_stage,'balance_cents',c.balance_cents,'wins',(select count(*) from public.pick_results r join public.official_picks p on p.id=r.pick_id join public.challenge_stages s on s.id=p.stage_id where s.challenge_id=c.id and r.result='WIN'),'losses',(select count(*) from public.pick_results r join public.official_picks p on p.id=r.pick_id join public.challenge_stages s on s.id=p.stage_id where s.challenge_id=c.id and r.result='LOSS')) order by c.number desc),'[]') from public.challenges c),'stages',(select coalesce(jsonb_agg(jsonb_build_object('stage_number',stage_number,'challenge_id',challenge_id,'game_id',game_id,'status',status) order by stage_number),'[]') from public.challenge_stages));
$$;
revoke all on function private.public_overview() from public;
grant execute on function private.public_overview() to anon,authenticated;

create or replace function public.desk_data() returns jsonb language sql stable security invoker set search_path='' as $$ select jsonb_build_object(
 'access',public.membership_status(), 'overview',private.public_overview(),
 'games',(select coalesce(jsonb_agg(t order by kickoff),'[]') from public.games t),
 'challenges',(select coalesce(jsonb_agg(t order by number desc),'[]') from public.challenges t),
 'stages',(select coalesce(jsonb_agg(t order by stage_number),'[]') from public.challenge_stages t),
 'markets',(select coalesce(jsonb_agg(t order by observed_at desc,created_at desc),'[]') from public.market_snapshots t),
 'analyses',(select coalesce(jsonb_agg(t order by created_at desc,version desc),'[]') from public.analysis_versions t),
 'picks',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.official_picks t),
 'entries',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.pick_entries t),
 'closings',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.closing_lines t),
 'results',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.pick_results t),
 'reviews',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.process_reviews t),
 'transactions',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.bankroll_transactions t),
 'audit',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.audit_events t)); $$;

-- Server-only functions. No browser role can create an order or grant a pass.
create function private.billing_order(p_id uuid,p_user uuid,p_plan text,p_expires timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare o private.billing_orders; begin
 perform pg_advisory_xact_lock(hashtext(p_user::text));
 if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null) then raise exception 'Confirmed account required'; end if;
 if p_plan not in ('full','half') or p_expires<=now() or p_expires>'2027-02-16T12:00:00Z' then raise exception 'Invalid pass'; end if;
 if exists(select 1 from private.memberships where user_id=p_user and revoked_at is null and starts_at<=now() and expires_at>now()) then raise exception 'An active pass already exists'; end if;
 select * into o from private.billing_orders where user_id=p_user and state='pending' and created_at>now()-interval '31 minutes' order by created_at desc limit 1;
 if found then
  if o.plan<>p_plan then raise exception 'A checkout is already pending. Retry after it expires in 31 minutes.'; end if;
  return to_jsonb(o);
 end if;
 insert into private.billing_orders(id,user_id,plan,amount,expires_at) values(p_id,p_user,p_plan,case when p_plan='full' then 1000 else 700 end,p_expires) returning * into o;
 return to_jsonb(o);
end $$;
create function private.billing_link(p_order uuid,p_checkout text) returns void language sql security definer set search_path='' as $$ update private.billing_orders set checkout_id=p_checkout where id=p_order and (checkout_id is null or checkout_id=p_checkout); $$;
create function private.billing_fulfill(p_order uuid,p_checkout text,p_intent text,p_amount integer,p_event text,p_type text) returns void language plpgsql security definer set search_path='' as $$
declare o private.billing_orders; begin
 select * into o from private.billing_orders where id=p_order for update;
 if not found or o.amount<>p_amount or (o.checkout_id is not null and o.checkout_id<>p_checkout) then raise exception 'Order mismatch'; end if;
 if exists(select 1 from private.billing_events where event_id=p_event) then return; end if;
 if o.state='revoked' then return; end if;
 update private.billing_orders set state='paid',checkout_id=p_checkout,payment_intent=p_intent where id=o.id;
 if o.expires_at>now() then
 insert into private.memberships(user_id,season,plan,expires_at,order_id) values(o.user_id,'2026',o.plan,o.expires_at,o.id) on conflict(order_id) do nothing;
 end if;
 insert into private.billing_events(event_id,event_type,order_id) values(p_event,p_type,o.id) on conflict do nothing;
end $$;
create function private.billing_revoke(p_intent text,p_event text,p_type text) returns void language plpgsql security definer set search_path='' as $$
declare oid uuid; begin
 select id into oid from private.billing_orders where payment_intent=p_intent for update;
 if oid is null then return; end if;
 update private.billing_orders set state='revoked' where id=oid;
 update private.memberships set revoked_at=coalesce(revoked_at,now()) where order_id=oid;
 insert into private.billing_events(event_id,event_type,order_id) values(p_event,p_type,oid) on conflict do nothing;
end $$;

revoke all on function private.billing_order(uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function private.billing_order(uuid,uuid,text,timestamptz) to service_role;
create function public.billing_order(p_id uuid,p_user uuid,p_plan text,p_expires timestamptz) returns jsonb language sql security invoker set search_path='' as $$ select private.billing_order(p_id,p_user,p_plan,p_expires); $$;
revoke all on function public.billing_order(uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.billing_order(uuid,uuid,text,timestamptz) to service_role;

revoke all on function private.billing_link(uuid,text) from public,anon,authenticated;
grant execute on function private.billing_link(uuid,text) to service_role;
create function public.billing_link(p_order uuid,p_checkout text) returns void language sql security invoker set search_path='' as $$ select private.billing_link(p_order,p_checkout); $$;
revoke all on function public.billing_link(uuid,text) from public,anon,authenticated;
grant execute on function public.billing_link(uuid,text) to service_role;

revoke all on function private.billing_fulfill(uuid,text,text,integer,text,text) from public,anon,authenticated;
grant execute on function private.billing_fulfill(uuid,text,text,integer,text,text) to service_role;
create function public.billing_fulfill(p_order uuid,p_checkout text,p_intent text,p_amount integer,p_event text,p_type text) returns void language sql security invoker set search_path='' as $$ select private.billing_fulfill(p_order,p_checkout,p_intent,p_amount,p_event,p_type); $$;
revoke all on function public.billing_fulfill(uuid,text,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.billing_fulfill(uuid,text,text,integer,text,text) to service_role;

revoke all on function private.billing_revoke(text,text,text) from public,anon,authenticated;
grant execute on function private.billing_revoke(text,text,text) to service_role;
create function public.billing_revoke(p_intent text,p_event text,p_type text) returns void language sql security invoker set search_path='' as $$ select private.billing_revoke(p_intent,p_event,p_type); $$;
revoke all on function public.billing_revoke(text,text,text) from public,anon,authenticated;
grant execute on function public.billing_revoke(text,text,text) to service_role;

grant usage on schema private to service_role;

-- Admin role alone is insufficient for publishing: require a verified MFA session.
create or replace function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(auth.jwt()->>'aal','aal1')='aal2' and exists(select 1 from private.admin_users where user_id=(select auth.uid()));
$$;
