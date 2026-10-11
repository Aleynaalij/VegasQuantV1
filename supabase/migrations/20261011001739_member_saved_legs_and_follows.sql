create table public.saved_legs(user_id uuid references auth.users(id) on delete cascade,leg_key text not null,created_at timestamptz not null default now(),primary key(user_id,leg_key));
create table public.leg_tails(user_id uuid references auth.users(id) on delete cascade,leg_key text not null,created_at timestamptz not null default now(),primary key(user_id,leg_key));
create table public.topic_follows(user_id uuid references auth.users(id) on delete cascade,kind text not null check(kind in ('team','player')),topic text not null check(length(topic) between 2 and 80),created_at timestamptz not null default now(),primary key(user_id,kind,topic));
create table public.alert_preferences(user_id uuid primary key references auth.users(id) on delete cascade,scope text not null default 'all' check(scope in ('all','followed')));
do $$ declare t text; begin
 foreach t in array array['saved_legs','leg_tails','topic_follows','alert_preferences'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select,insert,delete on public.%I to authenticated',t);
 execute format('create policy own_read on public.%I for select to authenticated using ((select auth.uid())=user_id)',t);
 execute format('create policy own_insert on public.%I for insert to authenticated with check ((select auth.uid())=user_id)',t);
 execute format('create policy own_delete on public.%I for delete to authenticated using ((select auth.uid())=user_id)',t);
 end loop;
end $$;
grant update on public.alert_preferences to authenticated;
create policy own_update on public.alert_preferences for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
-- Invalid or inaccessible publication IDs cannot be saved/tailed.
create policy valid_saved_leg on public.saved_legs as restrictive for insert to authenticated with check(exists(select 1 from public.published_legs l where l.leg_key=saved_legs.leg_key));
create policy valid_tailed_leg on public.leg_tails as restrictive for insert to authenticated with check(exists(select 1 from public.published_legs l where l.leg_key=leg_tails.leg_key and l.expires_at>now()));
create index leg_tails_leg on public.leg_tails(leg_key); create index topic_follows_match on public.topic_follows(kind,topic);
