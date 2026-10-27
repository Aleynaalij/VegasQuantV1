-- Simulator pregame capture journal (#132, research/game_sim/capture-contract.md v0.1 on #133).
-- A separate, append-only research journal: a forecast is recorded before kickoff by a service job,
-- read only by verified admins, and never edited, deleted or backdated. Nothing here publishes a
-- pick, writes a result or bankroll, or approves a model. Outcomes belong in a later append-only
-- table, never on these rows. DEMO and historical replays don't enter this journal.
--
-- Digests: input_sha256 and output_sha256 are sha256 of the UTF-8 text of the stored jsonb value
-- (Postgres' canonical jsonb rendering: keys ordered, whitespace normalized), computed by the server.
-- A caller's own file hashes are a different serialization and are not compared to these.

create table private.sim_model_registrations(
  model_id text not null check (length(model_id) between 1 and 200),
  artifact_sha256 text not null check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  protocol_id text not null check (length(protocol_id) between 1 and 200),
  registered_at timestamptz not null default now(),
  note text,
  primary key (model_id, artifact_sha256, protocol_id)
);
-- Registration lets a model record captures; it is not approval.
alter table private.sim_model_registrations enable row level security;
create trigger immutable_sim_model_registrations before update or delete on private.sim_model_registrations
  for each row execute function private.immutable();

create table private.sim_pregame_runs(
  id uuid primary key default gen_random_uuid(),
  schema_version text not null check (schema_version = 'vq-sim-capture/0.1'),
  run_key text not null unique check (length(run_key) between 1 and 200),
  game_id uuid not null references public.games(id),
  model_id text not null,
  artifact_sha256 text not null,
  protocol_id text not null,
  mode text not null check (mode in ('pregame', 'scenario')),
  scenario_id text check (scenario_id is null or length(scenario_id) between 1 and 200),
  parent_run_id uuid references private.sim_pregame_runs(id),
  generated_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  historical_cutoff timestamptz not null,
  kickoff_at_capture timestamptz not null,
  seed text not null check (length(seed) between 1 and 200),
  requested_runs integer not null check (requested_runs between 1 and 1000000),
  actual_runs integer not null check (actual_runs between 1 and requested_runs),
  inputs jsonb not null,
  input_sha256 text not null check (input_sha256 ~ '^[0-9a-f]{64}$'),
  output jsonb not null,
  output_sha256 text not null check (output_sha256 ~ '^[0-9a-f]{64}$'),
  blockers jsonb not null check (jsonb_typeof(blockers) = 'array'),
  replay_manifest jsonb not null check (jsonb_typeof(replay_manifest) = 'object'),
  foreign key (model_id, artifact_sha256, protocol_id)
    references private.sim_model_registrations(model_id, artifact_sha256, protocol_id),
  check ((mode = 'scenario') = (scenario_id is not null and parent_run_id is not null)),
  check (historical_cutoff <= generated_at and generated_at <= recorded_at + interval '5 minutes'),
  check (recorded_at < kickoff_at_capture)
);
alter table private.sim_pregame_runs enable row level security;
create trigger immutable_sim_pregame_runs before update or delete on private.sim_pregame_runs
  for each row execute function private.immutable();
revoke all on private.sim_model_registrations, private.sim_pregame_runs from public, anon, authenticated, service_role;

-- Problems with one simulated distribution {n, quantiles{p5..p95}, bins[{lo,hi,count}]}.
create function private.sim_distribution_errors(p_name text, d jsonb, p_runs integer)
returns text[] language plpgsql immutable set search_path = '' as $$
declare
  errs text[] := '{}';
  q text[] := array['p5', 'p25', 'p50', 'p75', 'p95'];
  k text;
  prev numeric := null;
  v numeric;
  b jsonb;
  total bigint := 0;
begin
  if jsonb_typeof(d) is distinct from 'object' then return array[p_name || ': missing']; end if;
  if jsonb_typeof(d->'n') is distinct from 'number' or (d->>'n')::numeric <> p_runs then
    errs := errs || (p_name || ': n must equal actual_runs');
  end if;
  foreach k in array q loop
    if jsonb_typeof(d->'quantiles'->k) is distinct from 'number' then
      errs := errs || (p_name || ': quantile ' || k || ' missing');
      continue;
    end if;
    v := (d->'quantiles'->>k)::numeric;
    if prev is not null and v < prev then errs := errs || (p_name || ': quantiles out of order'); end if;
    prev := v;
  end loop;
  if jsonb_typeof(d->'bins') is distinct from 'array' or jsonb_array_length(d->'bins') = 0 then
    return errs || (p_name || ': bins missing');
  end if;
  for b in select * from jsonb_array_elements(d->'bins') loop
    if jsonb_typeof(b->'lo') is distinct from 'number' or jsonb_typeof(b->'hi') is distinct from 'number'
      or jsonb_typeof(b->'count') is distinct from 'number'
      or (b->>'count')::numeric < 0 or (b->>'count')::numeric <> trunc((b->>'count')::numeric)
      or (b->>'lo')::numeric >= (b->>'hi')::numeric then
      errs := errs || (p_name || ': invalid bin');
    else
      total := total + (b->>'count')::bigint;
    end if;
  end loop;
  if total <> p_runs then errs := errs || (p_name || ': bin counts must sum to actual_runs'); end if;
  return errs;
end $$;

-- Service-only capture. Returns the stored id; a repeat of the same run_key with identical content
-- returns the original row, and any conflicting repeat fails.
create function private.record_sim_pregame_run(p_run jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  g public.games;
  errs text[] := '{}';
  existing private.sim_pregame_runs;
  parent private.sim_pregame_runs;
  generated timestamptz;
  cutoff timestamptz;
  requested integer;
  actual integer;
  inputs jsonb := p_run->'inputs';
  output jsonb := p_run->'output';
  src jsonb;
  wins jsonb;
  in_sha text;
  out_sha text;
  new_id uuid;
begin
  if pg_column_size(p_run) > 2000000 then raise exception 'Capture too large' using errcode = '22023'; end if;
  if p_run->>'schema_version' is distinct from 'vq-sim-capture/0.1' then
    raise exception 'Unsupported capture schema_version' using errcode = '22023';
  end if;
  select * into g from public.games where id = (p_run->>'game_id')::uuid;
  if not found then raise exception 'Unknown game' using errcode = '22023'; end if;
  if g.kickoff_tbd or g.kickoff is null then raise exception 'Kickoff not scheduled' using errcode = '22023'; end if;
  -- Live and final games have kicked off; only genuinely future games can be captured.
  if now() >= g.kickoff then raise exception 'Game has kicked off' using errcode = '22023'; end if;

  generated := (p_run->>'generated_at')::timestamptz;
  cutoff := (p_run->>'historical_cutoff')::timestamptz;
  requested := (p_run->>'requested_runs')::integer;
  actual := (p_run->>'actual_runs')::integer;
  if generated is null or cutoff is null then errs := errs || 'generated_at and historical_cutoff required'::text;
  else
    if cutoff > generated then errs := errs || 'historical_cutoff after generated_at'::text; end if;
    if generated > now() + interval '5 minutes' then errs := errs || 'generated_at in the future'::text; end if;
    if generated >= g.kickoff then errs := errs || 'generated_at not before kickoff'::text; end if;
  end if;
  if not exists (select 1 from private.sim_model_registrations r
      where r.model_id = p_run->>'model_id' and r.artifact_sha256 = p_run->>'artifact_sha256'
        and r.protocol_id = p_run->>'protocol_id') then
    errs := errs || 'model, artifact and protocol must be registered exactly'::text;
  end if;
  if actual is null or requested is null or actual < 1 or actual > requested then
    errs := errs || 'actual_runs must be between 1 and requested_runs'::text;
  end if;

  -- Source manifest: every source retrieved by generation time, with a real digest.
  if jsonb_typeof(inputs) is distinct from 'object' or jsonb_typeof(inputs->'sources') is distinct from 'array' then
    errs := errs || 'inputs.sources required'::text;
  else
    for src in select * from jsonb_array_elements(inputs->'sources') loop
      if coalesce(src->>'url', '') !~ '^https://' then errs := errs || 'source url must be https'::text; end if;
      if coalesce(src->>'sha256', '') !~ '^[0-9a-f]{64}$' then errs := errs || 'source sha256 must be 64 lowercase hex'::text; end if;
      if coalesce(src->>'category', '') = '' then errs := errs || 'source category required'::text; end if;
      if (src->>'retrieved_at') is null then errs := errs || 'source retrieved_at required'::text;
      elsif generated is not null and (src->>'retrieved_at')::timestamptz > generated then
        errs := errs || 'source retrieved after generated_at'::text;
      end if;
      if (src->>'usable_through') is not null and cutoff is not null
        and (src->>'usable_through')::timestamptz > cutoff then
        errs := errs || 'source usable after historical_cutoff'::text;
      end if;
    end loop;
  end if;

  -- Simulated outcome summaries, all from the same actual_runs.
  if jsonb_typeof(output) is distinct from 'object' then errs := errs || 'output required'::text;
  elsif actual is not null then
    errs := errs
      || private.sim_distribution_errors('margin', output->'margin', actual)
      || private.sim_distribution_errors('total', output->'total', actual)
      || private.sim_distribution_errors('home_score', output->'home_score', actual)
      || private.sim_distribution_errors('away_score', output->'away_score', actual);
    wins := output->'wins';
    if jsonb_typeof(wins->'home') is distinct from 'number' or jsonb_typeof(wins->'away') is distinct from 'number'
      or jsonb_typeof(wins->'tie') is distinct from 'number'
      or (wins->>'home')::numeric < 0 or (wins->>'away')::numeric < 0 or (wins->>'tie')::numeric < 0
      or (wins->>'home')::numeric + (wins->>'away')::numeric + (wins->>'tie')::numeric <> actual then
      errs := errs || 'output.wins home/away/tie must be nonnegative and sum to actual_runs'::text;
    end if;
  end if;
  if jsonb_typeof(p_run->'blockers') is distinct from 'array' then errs := errs || 'blockers must be an array'::text; end if;
  if jsonb_typeof(p_run->'replay_manifest') is distinct from 'object'
    or coalesce(p_run->'replay_manifest'->>'method', '') = '' then
    errs := errs || 'replay_manifest.method required'::text;
  end if;
  if p_run->>'mode' = 'scenario' then
    select * into parent from private.sim_pregame_runs where id = (p_run->>'parent_run_id')::uuid;
    if not found or parent.mode <> 'pregame' or parent.game_id <> g.id then
      errs := errs || 'scenario parent must be a pregame run of the same game'::text;
    end if;
  elsif p_run ? 'parent_run_id' and p_run->>'parent_run_id' is not null then
    errs := errs || 'only scenario runs have a parent'::text;
  end if;
  if array_length(errs, 1) > 0 then
    raise exception 'Invalid simulator capture' using errcode = '22023', detail = array_to_string(errs, '; ');
  end if;

  in_sha := encode(sha256(convert_to(inputs::text, 'UTF8')), 'hex');
  out_sha := encode(sha256(convert_to(output::text, 'UTF8')), 'hex');
  select * into existing from private.sim_pregame_runs where run_key = p_run->>'run_key';
  if found then
    if existing.input_sha256 = in_sha and existing.output_sha256 = out_sha and existing.game_id = g.id
      and existing.model_id = p_run->>'model_id' and existing.artifact_sha256 = p_run->>'artifact_sha256'
      and existing.generated_at = generated and existing.seed = p_run->>'seed' then
      return existing.id;
    end if;
    raise exception 'run_key already recorded with different content' using errcode = '23505';
  end if;

  insert into private.sim_pregame_runs(schema_version, run_key, game_id, model_id, artifact_sha256,
    protocol_id, mode, scenario_id, parent_run_id, generated_at, historical_cutoff, kickoff_at_capture,
    seed, requested_runs, actual_runs, inputs, input_sha256, output, output_sha256, blockers, replay_manifest)
  values (p_run->>'schema_version', p_run->>'run_key', g.id, p_run->>'model_id', p_run->>'artifact_sha256',
    p_run->>'protocol_id', p_run->>'mode', p_run->>'scenario_id', (p_run->>'parent_run_id')::uuid,
    generated, cutoff, g.kickoff, p_run->>'seed', requested, actual, inputs, in_sha, output, out_sha,
    p_run->'blockers', p_run->'replay_manifest')
  returning id into new_id;
  return new_id;
end $$;
revoke all on function private.record_sim_pregame_run(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.sim_distribution_errors(text, jsonb, integer) from public, anon, authenticated, service_role;

create function public.record_sim_pregame_run(p_run jsonb)
returns uuid language sql security definer set search_path = '' as $$
  select private.record_sim_pregame_run(p_run);
$$;
revoke all on function public.record_sim_pregame_run(jsonb) from public, anon, authenticated;
grant execute on function public.record_sim_pregame_run(jsonb) to service_role;

-- Admin read: newest captures first, with the summary a review needs. Full inputs stay server-side.
create function private.admin_sim_pregame_runs(p_limit integer default 50)
returns table(id uuid, run_key text, game_id uuid, matchup text, kickoff timestamptz, mode text,
  scenario_id text, parent_run_id uuid, model_id text, protocol_id text, generated_at timestamptz,
  recorded_at timestamptz, historical_cutoff timestamptz, requested_runs integer, actual_runs integer,
  input_sha256 text, output_sha256 text, blockers jsonb, output jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(private.is_admin(), false) then raise exception 'Verified administrator required' using errcode = '42501'; end if;
  return query
  select r.id, r.run_key, r.game_id, g.away_team || ' at ' || g.home_team, r.kickoff_at_capture, r.mode,
    r.scenario_id, r.parent_run_id, r.model_id, r.protocol_id, r.generated_at, r.recorded_at,
    r.historical_cutoff, r.requested_runs, r.actual_runs, r.input_sha256, r.output_sha256, r.blockers, r.output
  from private.sim_pregame_runs r join public.games g on g.id = r.game_id
  order by r.recorded_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;
revoke all on function private.admin_sim_pregame_runs(integer) from public, anon, service_role;
grant execute on function private.admin_sim_pregame_runs(integer) to authenticated;

create function public.admin_sim_pregame_runs(p_limit integer default 50)
returns table(id uuid, run_key text, game_id uuid, matchup text, kickoff timestamptz, mode text,
  scenario_id text, parent_run_id uuid, model_id text, protocol_id text, generated_at timestamptz,
  recorded_at timestamptz, historical_cutoff timestamptz, requested_runs integer, actual_runs integer,
  input_sha256 text, output_sha256 text, blockers jsonb, output jsonb)
language sql stable security invoker set search_path = '' as $$
  select * from private.admin_sim_pregame_runs(p_limit);
$$;
revoke all on function public.admin_sim_pregame_runs(integer) from public, anon;
grant execute on function public.admin_sim_pregame_runs(integer) to authenticated;
