-- Preserve historical $10/$7 orders. New orders use $20 season / $5 monthly.
alter table private.billing_orders drop constraint billing_orders_plan_check;
alter table private.billing_orders drop constraint billing_orders_amount_check;
alter table private.billing_orders add check(plan in ('full','half','monthly'));
alter table private.billing_orders add check(amount in (500,700,1000,2000));
create table private.billing_subscriptions (
 id text primary key, user_id uuid not null references auth.users(id), order_id uuid not null unique references private.billing_orders(id),
 customer_id text not null, status text not null, cancel_at_period_end boolean not null default false,
 paid_until timestamptz, blocked boolean not null default false, updated_at timestamptz not null default now()
);
create index billing_subscriptions_user_idx on private.billing_subscriptions(user_id);
create table private.billing_invoices (
 id text primary key, subscription_id text not null references private.billing_subscriptions(id),
 payment_intent text unique, period_end timestamptz not null, revoked_at timestamptz, created_at timestamptz not null default now()
);
create index billing_invoices_subscription_idx on private.billing_invoices(subscription_id);
alter table private.billing_subscriptions enable row level security;
alter table private.billing_invoices enable row level security;
revoke all on private.billing_subscriptions,private.billing_invoices from public,anon,authenticated;
create or replace function private.has_membership() returns boolean language sql stable security definer set search_path='' as $$
 select private.is_admin() or exists(select 1 from private.memberships where user_id=auth.uid() and revoked_at is null and starts_at<=now() and expires_at>now())
 or exists(select 1 from private.billing_subscriptions where user_id=auth.uid() and not blocked and paid_until>now());
$$;
create or replace function private.billing_order(p_id uuid,p_user uuid,p_plan text,p_expires timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare o private.billing_orders; begin
 perform pg_advisory_xact_lock(hashtext(p_user::text));
 if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null) then raise exception 'Confirmed account required'; end if;
 if p_plan not in ('full','monthly') or p_expires<=now() then raise exception 'Invalid plan'; end if;
 if p_plan='full' and p_expires is distinct from '2027-02-16T12:00:00Z'::timestamptz then raise exception 'Invalid season'; end if;
 if exists(select 1 from private.memberships where user_id=p_user and revoked_at is null and starts_at<=now() and expires_at>now())
 or exists(select 1 from private.billing_subscriptions where user_id=p_user and (paid_until>now() or status not in ('canceled','incomplete_expired'))) then raise exception 'Access or subscription already exists'; end if;
 select * into o from private.billing_orders where user_id=p_user and state='pending' and created_at>now()-interval '31 minutes' order by created_at desc limit 1;
 if found then
  if o.plan<>p_plan or o.amount<>(case when p_plan='full' then 2000 else 500 end) then raise exception 'Another checkout is pending'; end if;
  return to_jsonb(o);
 end if;
 insert into private.billing_orders(id,user_id,plan,amount,expires_at) values(p_id,p_user,p_plan,case when p_plan='full' then 2000 else 500 end,p_expires) returning * into o;
 return to_jsonb(o);
end $$;
-- Called only by verified server webhooks. Each paid invoice is an idempotent entitlement.
create function private.billing_subscription_sync(p jsonb) returns void language plpgsql security definer set search_path='' as $$
declare o private.billing_orders; s private.billing_subscriptions; begin
 select * into o from private.billing_orders where id=(p->>'order_id')::uuid for update;
 if not found or o.plan<>'monthly' or o.amount<>500 then raise exception 'Invalid subscription order'; end if;
 select * into s from private.billing_subscriptions where id=p->>'id' for update;
 if found and (s.order_id<>o.id or s.customer_id<>p->>'customer_id') then raise exception 'Subscription mismatch'; end if;
 insert into private.billing_subscriptions(id,user_id,order_id,customer_id,status,cancel_at_period_end)
 values(p->>'id',o.user_id,o.id,p->>'customer_id',p->>'status',(p->>'cancel_at_period_end')::boolean)
 on conflict(id) do update set status=excluded.status,cancel_at_period_end=excluded.cancel_at_period_end,updated_at=now();
 if nullif(p->>'invoice_id','') is not null then
  if (p->>'amount_paid')::integer<>500 or (p->>'period_end')::timestamptz<=now()-interval '1 year' then raise exception 'Invoice mismatch'; end if;
  insert into private.billing_invoices(id,subscription_id,payment_intent,period_end)
   values(p->>'invoice_id',p->>'id',p->>'payment_intent',(p->>'period_end')::timestamptz) on conflict(id) do nothing;
  update private.billing_subscriptions set paid_until=(select max(period_end) from private.billing_invoices where subscription_id=p->>'id' and revoked_at is null) where id=p->>'id';
  update private.billing_orders set state='paid' where id=o.id and state<>'revoked';
 end if;
 insert into private.billing_events(event_id,event_type,order_id) values(p->>'event_id',p->>'event_type',o.id) on conflict do nothing;
end $$;
create function public.billing_subscription_sync(p jsonb) returns void language sql security invoker set search_path='' as $$ select private.billing_subscription_sync(p); $$;
revoke all on function private.billing_subscription_sync(jsonb),public.billing_subscription_sync(jsonb) from public,anon,authenticated;
grant execute on function private.billing_subscription_sync(jsonb),public.billing_subscription_sync(jsonb) to service_role;
create function private.billing_account(p_user uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(s) from private.billing_subscriptions s where user_id=p_user order by updated_at desc limit 1;
$$;
create function public.billing_account(p_user uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.billing_account(p_user); $$;
revoke all on function private.billing_account(uuid),public.billing_account(uuid) from public,anon,authenticated;
grant execute on function private.billing_account(uuid),public.billing_account(uuid) to service_role;
-- A refund/dispute blocks the subscription so a delayed paid webhook cannot regrant access.
create or replace function private.billing_revoke(p_intent text,p_event text,p_type text) returns void language plpgsql security definer set search_path='' as $$
declare oid uuid; sid text; begin
 select subscription_id into sid from private.billing_invoices where payment_intent=p_intent for update;
 if sid is not null then
  update private.billing_invoices set revoked_at=coalesce(revoked_at,now()) where payment_intent=p_intent;
  update private.billing_subscriptions set blocked=true,updated_at=now() where id=sid returning order_id into oid;
 else
  select id into oid from private.billing_orders where payment_intent=p_intent for update;
  if oid is null then return; end if;
  update private.billing_orders set state='revoked' where id=oid;
  update private.memberships set revoked_at=coalesce(revoked_at,now()) where order_id=oid;
 end if;
 insert into private.billing_events(event_id,event_type,order_id) values(p_event,p_type,oid) on conflict do nothing;
end $$;
create function private.billing_subscription_block(p_id text,p_event text,p_type text) returns void language plpgsql security definer set search_path='' as $$
declare oid uuid; begin
 update private.billing_subscriptions set blocked=true,updated_at=now() where id=p_id returning order_id into oid;
 insert into private.billing_events(event_id,event_type,order_id) values(p_event,p_type,oid) on conflict do nothing;
end $$;
create function public.billing_subscription_block(p_id text,p_event text,p_type text) returns void language sql security invoker set search_path='' as $$select private.billing_subscription_block(p_id,p_event,p_type);$$;
revoke all on function private.billing_subscription_block(text,text,text),public.billing_subscription_block(text,text,text) from public,anon,authenticated;
grant execute on function private.billing_subscription_block(text,text,text),public.billing_subscription_block(text,text,text) to service_role;
