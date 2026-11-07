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
  grant_id uuid not null unique default gen_random_uuid(),
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
  reason text not null,
  operation text not null,
  before_state jsonb,
  after_state jsonb
);
-- An owner operation supplies one reason to its triggers in the same transaction.
-- Each operator function deletes its context before returning. On failure the
-- operation and its context roll back together.
create table private.tester_operation_context (
  transaction_id xid8 primary key default pg_catalog.pg_current_xact_id(),
  reason text not null check (length(reason) between 1 and 240)
);
alter table private.tester_operation_context enable row level security;
alter table private.tester_batches enable row level security;
alter table private.tester_batch_accounts enable row level security;
alter table private.tester_batch_audit enable row level security;
revoke all on private.tester_batches, private.tester_batch_accounts, private.tester_batch_audit,
  private.tester_operation_context
  from public, anon, authenticated, service_role;

create function private.begin_tester_operation(p_reason text)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  reason text := nullif(btrim(p_reason), '');
begin
  if reason is null or length(reason) > 240 then
    raise exception 'Tester operation requires a reason of 1–240 characters';
  end if;
  insert into private.tester_operation_context(reason) values (reason);
end $$;
revoke all on function private.begin_tester_operation(text) from public, anon, authenticated, service_role;

-- Audit uses an opaque grant identifier. Account deletion removes its mapping to a user.
create function private.audit_tester_batch()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  prior jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  next_state jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  reason text;
  removed_user uuid;
begin
  if prior is not distinct from next_state then return null; end if;
  if tg_table_name = 'tester_batch_accounts' and tg_op = 'DELETE' then
    removed_user := (prior->>'user_id')::uuid;
  elsif tg_table_name = 'tester_batches' and prior->>'canary_user_id' is not null
        and next_state->>'canary_user_id' is null then
    removed_user := (prior->>'canary_user_id')::uuid;
  end if;
  if removed_user is not null and not exists (select 1 from auth.users where id = removed_user) then
    reason := 'Auth account deletion';
  else
    select c.reason into reason from private.tester_operation_context c
      where c.transaction_id = pg_catalog.pg_current_xact_id_if_assigned();
  end if;
  if reason is null or length(reason) > 240 then
    raise exception 'Tester operation requires a reason of 1–240 characters';
  end if;

  if tg_table_name = 'tester_batches' then
    if prior is not null then
      prior := (prior - 'canary_user_id') || jsonb_build_object('canary_grant_id', (
        select grant_id from private.tester_batch_accounts
        where batch = prior->>'name' and user_id = (prior->>'canary_user_id')::uuid
      ));
    end if;
    next_state := (next_state - 'canary_user_id') || jsonb_build_object('canary_grant_id', (
      select grant_id from private.tester_batch_accounts
      where batch = next_state->>'name' and user_id = (next_state->>'canary_user_id')::uuid
    ));
  end if;
  insert into private.tester_batch_audit(batch, reason, operation, before_state, after_state)
    values (
      coalesce(next_state->>'batch', prior->>'batch', next_state->>'name'),
      reason, tg_table_name || '.' || lower(tg_op), prior - 'user_id', next_state - 'user_id'
    );
  return null;
end $$;
revoke all on function private.audit_tester_batch() from public, anon, authenticated, service_role;
create trigger audit_tester_batch after insert or update on private.tester_batches
  for each row execute function private.audit_tester_batch();
create trigger audit_tester_account after insert or update or delete on private.tester_batch_accounts
  for each row execute function private.audit_tester_batch();

create function private.keep_tester_cutoff()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.sealed_at is not null and
     (new.cutoff, new.name, new.sealed_at) is distinct from (old.cutoff, old.name, old.sealed_at) then
    raise exception 'Sealed tester cohort is immutable';
  end if;
  if new.sealed_at is null and
     (cardinality(new.enabled_features) > 0 or not new.canary_only or new.canary_user_id is not null) then
    raise exception 'Tester batch must be sealed before configuration';
  end if;
  if new.canary_user_id is not null and (not new.canary_only or not exists (
    select 1 from private.tester_batch_accounts where batch = new.name and user_id = new.canary_user_id
  )) then
    raise exception 'Canary must be an account in the sealed tester batch';
  end if;
  return new;
end $$;
revoke all on function private.keep_tester_cutoff() from public, anon, authenticated, service_role;
create trigger keep_tester_cutoff before insert or update on private.tester_batches
  for each row execute function private.keep_tester_cutoff();

create function private.keep_tester_roster()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  cohort private.tester_batches;
begin
  if tg_op = 'INSERT' then
    select * into strict cohort from private.tester_batches where name = new.batch for share;
    if cohort.sealed_at is not null then raise exception 'Sealed tester roster cannot gain accounts'; end if;
    if not exists (
      select 1 from auth.users u where u.id = new.user_id and u.created_at <= cohort.cutoff
        and not coalesce(u.is_anonymous, false)
    ) then raise exception 'Account is outside the tester snapshot'; end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if (new.batch, new.user_id, new.grant_id) is distinct from (old.batch, old.user_id, old.grant_id) then
      raise exception 'Tester grant identity is immutable';
    end if;
    return new;
  end if;
  if exists (select 1 from auth.users where id = old.user_id) then
    raise exception 'Tester roster entries may only be removed by auth account deletion';
  end if;
  return old;
end $$;
revoke all on function private.keep_tester_roster() from public, anon, authenticated, service_role;
create trigger keep_tester_roster before insert or update or delete on private.tester_batch_accounts
  for each row execute function private.keep_tester_roster();

create function private.keep_tester_history()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'Tester cohort history is retained';
end $$;
revoke all on function private.keep_tester_history() from public, anon, authenticated, service_role;
create trigger keep_tester_batch_history before delete or truncate on private.tester_batches
  for each statement execute function private.keep_tester_history();
create trigger keep_tester_roster_history before truncate on private.tester_batch_accounts
  for each statement execute function private.keep_tester_history();
create trigger keep_tester_audit_history before update or delete or truncate on private.tester_batch_audit
  for each statement execute function private.keep_tester_history();

-- Owner-operated. A replay with the same cutoff preserves the sealed roster and revocations.
create function private.seal_tester_batch(p_name text, p_cutoff timestamptz, p_reason text)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare
  batch private.tester_batches;
begin
  if p_cutoff is null or not isfinite(p_cutoff) or p_cutoff > statement_timestamp() then
    raise exception 'Explicit historical cutoff required';
  end if;
  perform private.begin_tester_operation(p_reason);
  insert into private.tester_batches(name, cutoff)
    values (p_name, p_cutoff) on conflict (name) do nothing;
  select * into strict batch from private.tester_batches where name = p_name for update;
  if batch.cutoff <> p_cutoff then
    raise exception 'Tester batch cutoff does not match';
  end if;
  if batch.sealed_at is null then
    insert into private.tester_batch_accounts(batch, user_id)
      select p_name, u.id from auth.users u
      where u.created_at <= p_cutoff and not coalesce(u.is_anonymous, false)
      on conflict on constraint tester_batch_accounts_pkey do nothing;
    update private.tester_batches set sealed_at = statement_timestamp() where name = p_name;
  end if;
  delete from private.tester_operation_context where transaction_id = pg_catalog.pg_current_xact_id();
  return (select count(*) from private.tester_batch_accounts a where a.batch = p_name);
end $$;
revoke all on function private.seal_tester_batch(text, timestamptz, text)
  from public, anon, authenticated, service_role;

create function private.configure_tester_batch(
  p_name text, p_features text[], p_canary_only boolean, p_canary_user uuid, p_reason text
)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform private.begin_tester_operation(p_reason);
  update private.tester_batches
  set enabled_features = p_features, canary_only = p_canary_only, canary_user_id = p_canary_user
  where name = p_name and sealed_at is not null;
  if not found then raise exception 'Unknown or unsealed tester batch'; end if;
  delete from private.tester_operation_context where transaction_id = pg_catalog.pg_current_xact_id();
end $$;
revoke all on function private.configure_tester_batch(text, text[], boolean, uuid, text)
  from public, anon, authenticated, service_role;

create function private.set_tester_revoked(p_name text, p_user uuid, p_revoked boolean, p_reason text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_revoked is null then raise exception 'Tester revocation state required'; end if;
  perform private.begin_tester_operation(p_reason);
  update private.tester_batch_accounts a
  set revoked_at = case when p_revoked then coalesce(a.revoked_at, statement_timestamp()) end
  from private.tester_batches b
  where a.batch = b.name and b.name = p_name and a.user_id = p_user and b.sealed_at is not null;
  if not found then raise exception 'Tester grant not found in a sealed batch'; end if;
  delete from private.tester_operation_context where transaction_id = pg_catalog.pg_current_xact_id();
end $$;
revoke all on function private.set_tester_revoked(text, uuid, boolean, text)
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
