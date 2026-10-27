create table public.onboarding_events(user_id uuid references auth.users(id) on delete cascade,event text not null check(event in ('profile_completed','notifications_enabled','first_saved_leg')),created_at timestamptz not null default now(),primary key(user_id,event));
alter table public.onboarding_events enable row level security;
revoke all on public.onboarding_events from anon,authenticated;
grant select on public.onboarding_events to authenticated;
create policy event_owner_read on public.onboarding_events for select to authenticated using((select auth.uid())=user_id or (select public.is_admin()));
create function private.record_onboarding() returns trigger language plpgsql security definer set search_path='' as $$ declare e text; begin
 if tg_table_name='saved_legs' then e:='first_saved_leg';
 elsif tg_table_name='push_subscriptions' then e:='notifications_enabled';
 elsif new.avatar is not null and new.username !~* '^Member_[a-f0-9]{8}$' then e:='profile_completed'; end if;
 if e is not null then insert into public.onboarding_events(user_id,event) values(new.user_id,e) on conflict do nothing;end if;return new;end $$;
revoke all on function private.record_onboarding() from public,anon,authenticated;
create trigger saved_leg_onboarding after insert on public.saved_legs for each row execute function private.record_onboarding();
create trigger push_onboarding after insert on public.push_subscriptions for each row execute function private.record_onboarding();
create trigger profile_onboarding after insert or update on public.community_profiles for each row execute function private.record_onboarding();
-- Existing completions are a current-state baseline, not invented past event times.
create function private.engagement_metrics() returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'Admin access required';end if;
 return jsonb_build_object('accounts',(select count(*) from auth.users),'profiles',(select count(*) from public.community_profiles where avatar is not null and username !~* '^Member_[a-f0-9]{8}$'),'push_members',(select count(distinct user_id) from public.push_subscriptions),'saved_members',(select count(distinct user_id) from public.saved_legs),'events',(select coalesce(jsonb_agg(t),'[]') from (select event,count(*) as members from public.onboarding_events group by event)t));end $$;
revoke all on function private.engagement_metrics() from public,anon,authenticated;
grant execute on function private.engagement_metrics() to authenticated;
create function public.engagement_metrics() returns jsonb language sql stable security invoker set search_path='' as $$ select private.engagement_metrics(); $$;
revoke all on function public.engagement_metrics() from public,anon,authenticated;
grant execute on function public.engagement_metrics() to authenticated;
create function private.leg_tail_count(p_leg text) returns bigint language plpgsql stable security definer set search_path='' as $$ begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 return (select count(*) from public.leg_tails where leg_key=p_leg);end $$;
revoke all on function private.leg_tail_count(text) from public,anon,authenticated;
grant execute on function private.leg_tail_count(text) to authenticated;
create function public.leg_tail_count(p_leg text) returns bigint language sql stable security invoker set search_path='' as $$ select private.leg_tail_count(p_leg); $$;
revoke all on function public.leg_tail_count(text) from public,anon,authenticated;
grant execute on function public.leg_tail_count(text) to authenticated;

