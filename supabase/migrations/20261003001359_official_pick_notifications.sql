create table public.push_subscriptions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 endpoint text not null unique check(length(endpoint)<=2048 and endpoint ~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|[a-z0-9-]+[.]notify[.]windows[.]com)/'),
 p256dh text not null check(length(p256dh) between 80 and 100), auth text not null check(length(auth) between 20 and 30), created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon,authenticated;
grant select,delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
create policy own_push_read on public.push_subscriptions for select to authenticated using(user_id=(select auth.uid()));
create policy own_push_delete on public.push_subscriptions for delete to authenticated using(user_id=(select auth.uid()));
create table private.push_config(singleton boolean primary key default true check(singleton),public_key text not null,private_key_secret uuid not null,dispatch_secret uuid not null);
create table private.push_deliveries(id uuid primary key default gen_random_uuid(),subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,pick_id uuid not null references public.official_picks(id),created_at timestamptz not null default now(),next_at timestamptz not null default now(),attempts integer not null default 0,sent_at timestamptz,failed boolean not null default false,unique(subscription_id,pick_id));
alter table private.push_config enable row level security;
alter table private.push_deliveries enable row level security;
revoke all on private.push_config,private.push_deliveries from public,anon,authenticated;
create function private.push_public_key() returns text language sql stable security definer set search_path='' as $$ select public_key from private.push_config where singleton; $$;
revoke all on function private.push_public_key() from public;
grant execute on function private.push_public_key() to anon,authenticated;
create function public.push_public_key() returns text language sql stable security invoker set search_path='' as $$ select private.push_public_key(); $$;
revoke all on function public.push_public_key() from public;
grant execute on function public.push_public_key() to anon,authenticated;
create function public.register_push(p_endpoint text,p_p256dh text,p_auth text) returns void language plpgsql security definer set search_path='' as $$
 begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if exists(select 1 from public.push_subscriptions where endpoint=p_endpoint and user_id<>auth.uid()) then raise exception 'Device already registered to another account'; end if;
 if not exists(select 1 from public.push_subscriptions where endpoint=p_endpoint) and (select count(*) from public.push_subscriptions where user_id=auth.uid())>=5 then raise exception 'Five-device limit reached'; end if;
 insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values(auth.uid(),p_endpoint,p_p256dh,p_auth) on conflict(endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth where push_subscriptions.user_id=auth.uid();
 end $$;
revoke all on function public.register_push(text,text,text) from public;
grant execute on function public.register_push(text,text,text) to authenticated;
create function private.enqueue_pick_push() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into private.push_deliveries(subscription_id,pick_id) select id,new.id from public.push_subscriptions on conflict do nothing;return new;end $$;
revoke all on function private.enqueue_pick_push() from public;
create trigger enqueue_official_push after insert on public.official_picks for each row execute function private.enqueue_pick_push();
create function public.push_server_config() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('public_key',c.public_key,'private_key',k.decrypted_secret,'dispatch_secret',d.decrypted_secret) from private.push_config c join vault.decrypted_secrets k on k.id=c.private_key_secret join vault.decrypted_secrets d on d.id=c.dispatch_secret;
$$;
revoke all on function public.push_server_config() from public,anon,authenticated;
grant execute on function public.push_server_config() to service_role;
create function public.claim_push_deliveries() returns jsonb language plpgsql security definer set search_path='' as $$ declare ids uuid[]; begin
 select array_agg(id) into ids from (select d.id from private.push_deliveries d join public.official_picks p on p.id=d.pick_id where d.sent_at is null and not d.failed and d.attempts<5 and d.next_at<=now() and p.created_at>now()-interval '2 hours' order by d.created_at for update of d skip locked limit 25) t;
 update private.push_deliveries set attempts=attempts+1,next_at=now()+interval '5 minutes' where id=any(ids);
 return (select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'pick_id',d.pick_id,'subscription_id',s.id,'endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth))),'[]'::jsonb) from private.push_deliveries d join public.push_subscriptions s on s.id=d.subscription_id where d.id=any(ids));
 end $$;
revoke all on function public.claim_push_deliveries() from public,anon,authenticated;
grant execute on function public.claim_push_deliveries() to service_role;
create function public.finish_push_delivery(p_id uuid,p_sent boolean,p_expired boolean default false) returns void language plpgsql security definer set search_path='' as $$ begin
 if p_expired then delete from public.push_subscriptions where id=(select subscription_id from private.push_deliveries where id=p_id);
 elsif p_sent then update private.push_deliveries set sent_at=now() where id=p_id;
 else update private.push_deliveries set failed=attempts>=5 where id=p_id;
 end if;end $$;
revoke all on function public.finish_push_delivery(uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.finish_push_delivery(uuid,boolean,boolean) to service_role;
-- Only call the dispatcher while there are due messages. No old picks are backfilled.
create function private.invoke_push_dispatcher() returns void language plpgsql security definer set search_path='' as $$ begin
 if exists(select 1 from private.push_deliveries d join public.official_picks p on p.id=d.pick_id where d.sent_at is null and not d.failed and d.attempts<5 and d.next_at<=now() and p.created_at>now()-interval '2 hours') then
 perform net.http_post(url:='https://vegasquant.app/api/notifications/dispatch',headers:=jsonb_build_object('Content-Type','application/json','x-vq-dispatch',(select v.decrypted_secret from private.push_config c join vault.decrypted_secrets v on v.id=c.dispatch_secret)),body:='{}'::jsonb,timeout_milliseconds:=10000);
 end if;end $$;
revoke all on function private.invoke_push_dispatcher() from public,anon,authenticated;
select cron.schedule('vq-official-push-dispatch','* * * * *','select private.invoke_push_dispatcher();');
