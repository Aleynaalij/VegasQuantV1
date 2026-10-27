create or replace function private.enqueue_pick_push() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into private.push_deliveries(subscription_id,pick_id) select id,new.id from public.push_subscriptions where private.wants_publication(user_id,new.game_id,new.selection||' '||new.why_like) on conflict do nothing;return new;end $$;

