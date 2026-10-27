alter table private.push_deliveries alter column pick_id drop not null;
alter table private.push_deliveries add column kind text not null default 'official' check(kind in ('official','research','signup'));
alter table private.push_deliveries add column event_key text;
create unique index push_event_dedupe on private.push_deliveries(subscription_id,event_key) where event_key is not null;
create function private.enqueue_research_push() returns trigger language plpgsql security definer set search_path='' as $$
declare bucket text; begin
-- One alert per ten-minute publication batch, even across analyses and feed posts.
bucket := 'research:'||floor(extract(epoch from now())/600)::text;
insert into private.push_deliveries(subscription_id,kind,event_key,next_at)
select id,'research',bucket,now()+interval '2 minutes' from public.push_subscriptions on conflict do nothing;
return new;
end $$;
revoke all on function private.enqueue_research_push() from public,anon,authenticated;
create trigger research_analysis_push after insert on public.analysis_versions for each row execute function private.enqueue_research_push();
create trigger research_feed_push after insert on public.research_feed_posts for each row execute function private.enqueue_research_push();
create function private.enqueue_signup_push() returns trigger language plpgsql security definer set search_path='' as $$
begin
if coalesce(new.is_anonymous,false) then return new; end if;
insert into private.push_deliveries(subscription_id,kind,event_key)
select s.id,'signup','signup:'||new.id::text from public.push_subscriptions s join private.admin_users a on a.user_id=s.user_id on conflict do nothing;
return new;
exception when others then
raise warning 'Admin signup notification could not be queued';
return new;
end $$;
revoke all on function private.enqueue_signup_push() from public,anon,authenticated;
create trigger admin_signup_push after insert on auth.users for each row execute function private.enqueue_signup_push();
do $migration$
declare original text; updated text; begin
original:=pg_get_functiondef('public.claim_push_deliveries()'::regprocedure);
updated:=replace(original,'join public.official_picks p on p.id=d.pick_id','left join public.official_picks p on p.id=d.pick_id');
updated:=replace(updated,'p.created_at>now()-interval ''2 hours''','coalesce(p.created_at,d.created_at)>now()-interval ''2 hours''');
updated:=replace(updated,'''pick_id'',d.pick_id,','''pick_id'',d.pick_id,''type'',d.kind,');
if updated=original then raise exception 'Claim definition changed'; end if;
execute updated;
original:=pg_get_functiondef('private.invoke_push_dispatcher()'::regprocedure);
updated:=replace(original,'join public.official_picks p on p.id=d.pick_id','left join public.official_picks p on p.id=d.pick_id');
updated:=replace(updated,'p.created_at>now()-interval ''2 hours''','coalesce(p.created_at,d.created_at)>now()-interval ''2 hours''');
if updated=original then raise exception 'Dispatcher definition changed'; end if;
execute updated;
end $migration$;
