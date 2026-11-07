-- Separate tester entitlement. Creating the schema creates no cohort and grants no tester access.
begin;

create table private.tester_batches (
  name text primary key check (name ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  cutoff timestamptz not null,
  sealed_at timestamptz,
  canary_only boolean not null default true,
  canary_user_id uuid references auth.users(id) on delete set null,
  enabled_features text[] not null default '{}'
    check (array_position(enabled_features, null) is null
      and enabled_features <@ array['research', 'fear']::text[])
);
create table private.tester_batch_accounts (
  batch text not null references private.tester_batches(name),
  user_id uuid not null references auth.users(id) on delete cascade,
  revoked_at timestamptz,
  primary key (batch, user_id)
);
create index tester_batch_accounts_by_user
  on private.tester_batch_accounts (user_id, batch) where revoked_at is null;
create table private.tester_batch_audit (
  id bigint generated always as identity primary key,
  batch text not null,
  at timestamptz not null default statement_timestamp(),
  actor text not null default session_user,
  before_state jsonb not null,
  after_state jsonb not null
);
alter table private.tester_batches enable row level security;
alter table private.tester_batch_accounts enable row level security;
alter table private.tester_batch_audit enable row level security;
revoke all on private.tester_batches, private.tester_batch_accounts, private.tester_batch_audit
  from public, anon, authenticated, service_role;

create function private.audit_tester_batch()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if to_jsonb(old) is distinct from to_jsonb(new) then
    insert into private.tester_batch_audit(batch, before_state, after_state)
      values (new.name, to_jsonb(old), to_jsonb(new));
  end if;
  return new;
end $$;
revoke all on function private.audit_tester_batch() from public, anon, authenticated, service_role;
create trigger audit_tester_batch after update on private.tester_batches
  for each row execute function private.audit_tester_batch();

create function private.keep_tester_cutoff()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.sealed_at is not null and
     (new.cutoff, new.name, new.sealed_at) is distinct from (old.cutoff, old.name, old.sealed_at) then
    raise exception 'Sealed tester cohort is immutable';
  end if;
  return new;
end $$;
revoke all on function private.keep_tester_cutoff() from public, anon, authenticated, service_role;
create trigger keep_tester_cutoff before update on private.tester_batches
  for each row execute function private.keep_tester_cutoff();

-- Owner-operated. A replay with the same cutoff preserves the sealed roster and revocations.
create function private.seal_tester_batch(p_name text, p_cutoff timestamptz)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare
  batch private.tester_batches;
begin
  if p_cutoff is null or not isfinite(p_cutoff) or p_cutoff > statement_timestamp() then
    raise exception 'Explicit historical cutoff required';
  end if;
  insert into private.tester_batches(name, cutoff)
    values (p_name, p_cutoff) on conflict (name) do nothing;
  select * into strict batch from private.tester_batches where name = p_name for update;
  if batch.cutoff <> p_cutoff then
    raise exception 'Tester batch cutoff does not match';
  end if;
  if batch.sealed_at is null then
    insert into private.tester_batch_accounts(batch, user_id)
      select p_name, u.id
      from auth.users u
      where u.created_at <= p_cutoff and not coalesce(u.is_anonymous, false);
    update private.tester_batches set sealed_at = statement_timestamp() where name = p_name;
  end if;
  return (select count(*) from private.tester_batch_accounts a where a.batch = p_name);
end $$;
revoke all on function private.seal_tester_batch(text, timestamptz)
  from public, anon, authenticated, service_role;

create function private.tester_feature_access(p_feature text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  viewer uuid := auth.uid();
  session_id text := auth.jwt()->>'session_id';
begin
  if viewer is null or p_feature is null or p_feature not in ('research', 'fear')
     or session_id is null
     or session_id !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
     or auth.jwt()->>'is_anonymous' = 'true' then
    return false;
  end if;
  return exists (
    select 1
    from private.tester_batch_accounts a
    join private.tester_batches b on b.name = a.batch
    join auth.users u on u.id = a.user_id
    join auth.sessions s on s.user_id = u.id and s.id = session_id::uuid
    where a.user_id = viewer and a.revoked_at is null and b.sealed_at is not null
      and p_feature = any(b.enabled_features)
      and (not b.canary_only or b.canary_user_id = viewer)
      and u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false)
      and (u.banned_until is null or u.banned_until <= now())
      and (s.not_after is null or s.not_after > now())
      and not exists (
        select 1 from private.account_erasure_jobs e
        where e.user_id = viewer and e.expires_at > now()
      )
      and private.age_member_allowed()
  );
end $$;

create function public.tester_feature_access(p_feature text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.tester_feature_access(p_feature);
$$;
revoke all on function private.tester_feature_access(text), public.tester_feature_access(text)
  from public, anon, authenticated, service_role;
grant execute on function private.tester_feature_access(text), public.tester_feature_access(text)
  to authenticated;

-- Only explicitly named scalar fields may cross the tester boundary.
create function private.tester_scalar_fields(p_object jsonb, p_keys text[])
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select coalesce(jsonb_object_agg(k, p_object->k), '{}'::jsonb)
  from unnest(p_keys) k
  where jsonb_typeof(p_object->k) in ('string', 'number')
    and length(p_object->>k) <= 512;
$$;
revoke all on function private.tester_scalar_fields(jsonb, text[])
  from public, anon, authenticated, service_role;

create function private.tester_observation_page(
  p_feature text, p_sport text, p_game uuid, p_section text, p_as_of timestamptz,
  p_before timestamptz default null, p_after_id uuid default null
)
returns table(id uuid, game_id uuid, kind text, provider text, source text,
              observed_at timestamptz, recorded_at timestamptz, payload jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  window_start timestamptz;
  event_start timestamptz;
  row_limit integer;
begin
  if not private.tester_feature_access(p_feature) then
    raise insufficient_privilege using message = 'Tester feature unavailable';
  end if;
  if p_sport is null or p_sport not in ('nfl', 'nba') or p_game is null
     or p_section is null or p_section not in ('quotes', 'injury', 'context')
     or (p_section = 'context' and (p_feature <> 'research' or p_sport <> 'nfl'))
     or p_as_of is null or not isfinite(p_as_of)
     or p_as_of < statement_timestamp() - interval '10 minutes'
     or p_as_of > statement_timestamp() + interval '30 seconds'
     or (p_before is null) <> (p_after_id is null)
     or (p_section <> 'quotes' and p_before is not null) then
    raise invalid_parameter_value using message = 'Invalid tester observation scope';
  end if;

  if p_sport = 'nfl' then
    select g.kickoff into event_start from public.games g
      where g.id = p_game and g.sport = 'nfl' and not g.kickoff_tbd;
  else
    select g.tipoff into event_start from public.nba_games g
      where g.id = p_game and not g.tipoff_tbd
        and g.status not in ('STATUS_FINAL', 'STATUS_CANCELED', 'STATUS_POSTPONED', 'STATUS_SUSPENDED');
  end if;
  if event_start is null or event_start > p_as_of + interval '7 days'
     or event_start <= (case when p_feature = 'fear' then p_as_of else p_as_of - interval '6 hours' end) then
    raise invalid_parameter_value using message = 'Game outside tester research window';
  end if;

  window_start := p_as_of - case
    when p_section = 'injury' then interval '7 days'
    when p_feature = 'fear' then interval '72 hours'
    else interval '48 hours'
  end;
  row_limit := case when p_section = 'quotes' then 251 else 101 end;
  if p_before is not null and (p_before < window_start or p_before > p_as_of) then
    raise invalid_parameter_value using message = 'Cursor outside tester research window';
  end if;

  return query
  with records as (
    select o.id, o.game_id, o.kind, o.provider, o.source, o.observed_at, o.recorded_at, o.payload
    from public.source_observations o where p_sport = 'nfl' and o.game_id = p_game
    union all
    select o.id, o.game_id, o.kind, o.provider, o.source, o.observed_at, o.recorded_at, o.payload
    from public.nba_observations o where p_sport = 'nba' and o.game_id = p_game
  ), bounded as (
    select o.*
    from records o
    where o.recorded_at >= window_start and o.recorded_at <= p_as_of
      and (o.observed_at is null or o.observed_at <= p_as_of)
      and (p_before is null or o.recorded_at < p_before
        or (o.recorded_at = p_before and o.id > p_after_id))
      and case p_section
        when 'injury' then o.kind = 'injury'
        when 'context' then o.kind in ('news', 'weather')
        else (
          (o.kind = 'odds' and o.payload->>'market' in ('h2h', 'spreads', 'totals'))
          or (p_sport = 'nba' and o.kind = 'prop' and o.payload->>'market' in
            ('player_points', 'player_rebounds', 'player_assists', 'player_threes', 'player_points_rebounds_assists'))
        ) and o.observed_at < event_start
          and (p_feature <> 'fear' or o.observed_at >= window_start)
          and (p_sport <> 'nfl' or p_feature <> 'research'
            or (o.payload->>'book' = 'FanDuel' and o.observed_at >= p_as_of - interval '6 hours'))
      end
    order by case when p_feature = 'fear' and p_section = 'injury' then o.observed_at end desc nulls last,
      o.recorded_at desc, o.id
    limit row_limit
  )
  select o.id, o.game_id, o.kind, left(o.provider, 120),
    case when o.source ~* '^https?://[a-z0-9.-]+(:[0-9]{1,5})?([/?#]|$)'
      then left(split_part(split_part(o.source, '?', 1), '#', 1), 512)
      else '' end,
    o.observed_at, o.recorded_at,
    case o.kind
      when 'injury' then private.tester_scalar_fields(o.payload,
        array['team','player','status','detail','injury','position','expected_return'])
      when 'news' then private.tester_scalar_fields(o.payload, array['headline'])
      when 'weather' then private.tester_scalar_fields(o.payload,
        array['forecast','temperature','wind_speed','wind_direction','precipitation','location','issued_at'])
      else private.tester_scalar_fields(o.payload, array['event_id','book','market'])
        || jsonb_build_object('outcomes', coalesce((
          select jsonb_agg(private.tester_scalar_fields(v.item, array['name','description','point','price']) order by v.seq)
          from jsonb_array_elements(case when jsonb_typeof(o.payload->'outcomes') = 'array'
            then o.payload->'outcomes' else '[]'::jsonb end) with ordinality v(item, seq)
          where v.seq <= 120 and jsonb_typeof(v.item) = 'object'
        ), '[]'::jsonb))
    end
  from bounded o
  order by case when p_feature = 'fear' and p_section = 'injury' then o.observed_at end desc nulls last,
      o.recorded_at desc, o.id;
end $$;

create function public.tester_observation_page(
  p_feature text, p_sport text, p_game uuid, p_section text, p_as_of timestamptz,
  p_before timestamptz default null, p_after_id uuid default null
)
returns table(id uuid, game_id uuid, kind text, provider text, source text,
              observed_at timestamptz, recorded_at timestamptz, payload jsonb)
language sql stable security invoker set search_path = '' as $$
  select * from private.tester_observation_page(
    p_feature, p_sport, p_game, p_section, p_as_of, p_before, p_after_id
  );
$$;
revoke all on function private.tester_observation_page(text,text,uuid,text,timestamptz,timestamptz,uuid),
  public.tester_observation_page(text,text,uuid,text,timestamptz,timestamptz,uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.tester_observation_page(text,text,uuid,text,timestamptz,timestamptz,uuid),
  public.tester_observation_page(text,text,uuid,text,timestamptz,timestamptz,uuid)
  to authenticated;

commit;
