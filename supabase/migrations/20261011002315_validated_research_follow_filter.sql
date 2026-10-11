create or replace function private.enqueue_research_push() returns trigger language plpgsql security definer set search_path='' as $$ declare bucket text;gid uuid; begin
 bucket:='research:'||floor(extract(epoch from now())/600)::text;gid:=(to_jsonb(new)->>'game_id')::uuid;
 insert into private.push_deliveries(subscription_id,kind,event_key,next_at) select id,'research',bucket,now()+interval '2 minutes' from public.push_subscriptions where private.wants_publication(user_id,gid,to_jsonb(new)::text) on conflict do nothing;return new;end $$;

