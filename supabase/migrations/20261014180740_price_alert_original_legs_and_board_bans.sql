-- Follow-up to price_alerts_and_tail_leaderboard (Codex review on #32):
-- 1) Price revisions store tails/saves under the ORIGINAL leg key (candidate.original_leg_key), so a
--    second repricing must look those up, not only legs of the directly superseded release.
-- 2) The leaderboard hides banned or unconfirmed accounts, like the rest of Community.
create or replace function private.enqueue_price_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare old_ids uuid[]; original_keys text[];
begin
  select coalesce(array_agg(distinct (c ->> 'supersedes_release_id')::uuid), '{}')
    into old_ids
    from jsonb_array_elements(new.candidates) c
   where c ->> 'supersedes_release_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  if cardinality(old_ids) = 0 or new.expires_at <= now() then return new; end if;
  select coalesce(array_agg(distinct c ->> 'original_leg_key'), '{}')
    into original_keys
    from jsonb_array_elements(new.candidates) c
   where coalesce(c ->> 'original_leg_key', '') <> '';
  insert into private.push_deliveries(subscription_id, kind, event_key, next_at)
  select s.id, 'price', 'price:' || new.id::text, now() + interval '1 minute'
    from public.push_subscriptions s
   where s.user_id in (
           select t.user_id from public.leg_tails t
            where t.leg_key = any(original_keys)
               or t.leg_key in (select l.leg_key from public.published_legs l where l.release_id = any(old_ids))
           union
           select v.user_id from public.saved_legs v
            where v.leg_key = any(original_keys)
               or v.leg_key in (select l.leg_key from public.published_legs l where l.release_id = any(old_ids)))
  on conflict do nothing;
  return new;
exception when others then
  raise warning 'Price alert could not be queued';
  return new;
end $$;

create or replace function private.tail_leaderboard(p_days integer default 7) returns jsonb
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
      join auth.users u on u.id = a.user_id
     where a.w + a.l >= 3 and private.age_member_allowed()
       and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until <= now())
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'username', username, 'wins', w, 'losses', l, 'pushes', p, 'score', round(score * 100, 1))
           order by score desc, w + l desc, username), '[]'::jsonb)
    from (select * from ranked order by score desc, w + l desc, username limit 25) top
$$;
