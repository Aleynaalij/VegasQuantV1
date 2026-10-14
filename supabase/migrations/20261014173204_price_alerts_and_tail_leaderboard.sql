-- 1) Price-move alerts: when a pick release is republished with new prices (a candidate carries
--    supersedes_release_id), members who tailed or saved a leg of the old release get one push.
--    Same age rules as research alerts. Publishing never fails because of an alert.
alter table private.push_deliveries drop constraint push_deliveries_kind_check;
alter table private.push_deliveries add constraint push_deliveries_kind_check
  check (kind = any (array['official', 'research', 'signup', 'health', 'price']));

create or replace function private.age_push_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare recipient uuid;
begin
  select user_id into recipient from public.push_subscriptions where id = new.subscription_id;
  if new.kind in ('official', 'candidate', 'research', 'price') and not private.age_eligible(recipient) then
    return null;
  end if;
  return new;
end $$;

create or replace function private.age_push_delivery_allowed(p_delivery uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select d.kind not in ('official', 'research', 'price') or private.age_eligible(s.user_id)
    from private.push_deliveries d join public.push_subscriptions s on s.id = d.subscription_id
    where d.id = p_delivery), false)
$$;

create function private.enqueue_price_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare old_ids uuid[];
begin
  select coalesce(array_agg(distinct (c ->> 'supersedes_release_id')::uuid), '{}')
    into old_ids
    from jsonb_array_elements(new.candidates) c
   where c ->> 'supersedes_release_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  if cardinality(old_ids) = 0 or new.expires_at <= now() then return new; end if;
  insert into private.push_deliveries(subscription_id, kind, event_key, next_at)
  select s.id, 'price', 'price:' || new.id::text, now() + interval '1 minute'
    from public.push_subscriptions s
   where s.user_id in (
           select t.user_id from public.leg_tails t
             join public.published_legs l on l.leg_key = t.leg_key
            where l.release_id = any(old_ids)
           union
           select v.user_id from public.saved_legs v
             join public.published_legs l on l.leg_key = v.leg_key
            where l.release_id = any(old_ids))
  on conflict do nothing;
  return new;
exception when others then
  raise warning 'Price alert could not be queued';
  return new;
end $$;
revoke all on function private.enqueue_price_push() from public, anon, authenticated;
create trigger enqueue_price_push after insert on public.candidate_releases
  for each row execute function private.enqueue_price_push();

-- 2) Weekly tail leaderboard: verified results of tailed legs, members with a visible community
--    profile only, at least 3 decided legs, ranked by the 95% Wilson lower bound of win rate
--    (rewards hit rate backed by sample size, not tailing everything). Usernames only.
create function private.tail_leaderboard(p_days integer default 7) returns jsonb
language sql stable security definer set search_path = '' as $$
  with graded as (
    select t.user_id, l.result
      from public.leg_tails t
      join public.published_legs l on l.leg_key = t.leg_key
     where l.published_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 365))
       and l.result in ('WIN', 'LOSS', 'PUSH')
       and l.result_source ~ '^https://'
  ), agg as (
    select user_id,
           count(*) filter (where result = 'WIN') as w,
           count(*) filter (where result = 'LOSS') as l,
           count(*) filter (where result = 'PUSH') as p
      from graded group by user_id
  ), ranked as (
    select cp.username, a.w, a.l, a.p,
           ((a.w::numeric / (a.w + a.l)) + 1.9208 / (a.w + a.l)
             - 1.96 * sqrt(((a.w::numeric / (a.w + a.l)) * (1 - a.w::numeric / (a.w + a.l)) + 0.9604 / (a.w + a.l)) / (a.w + a.l)))
           / (1 + 3.8416 / (a.w + a.l)) as score
      from agg a
      join public.community_profiles cp on cp.user_id = a.user_id and cp.visible and cp.username is not null
     where a.w + a.l >= 3 and private.age_member_allowed()
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'username', username, 'wins', w, 'losses', l, 'pushes', p, 'score', round(score * 100, 1))
           order by score desc, w + l desc, username), '[]'::jsonb)
    from (select * from ranked order by score desc, w + l desc, username limit 25) top
$$;
revoke all on function private.tail_leaderboard(integer) from public, anon, authenticated;
grant execute on function private.tail_leaderboard(integer) to authenticated;
create function public.tail_leaderboard(p_days integer default 7) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.tail_leaderboard(p_days) $$;
revoke all on function public.tail_leaderboard(integer) from public, anon;
grant execute on function public.tail_leaderboard(integer) to authenticated;
