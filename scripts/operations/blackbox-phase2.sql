-- Install only in the isolated validation project after blackbox-staging.sql.
begin;
create table blackbox.memory (
  task_id text not null,
  version integer not null,
  outcome jsonb not null,
  primary key (task_id, version),
  foreign key (task_id,version) references blackbox.events(task_id,version)
);
alter table blackbox.memory enable row level security;
revoke all on blackbox.memory from public, anon, authenticated;
alter function public.blackbox_stage(text,text,integer,uuid,text,uuid) set schema blackbox;
revoke all on function blackbox.blackbox_stage(text,text,integer,uuid,text,uuid) from public, anon, authenticated;

create function public.blackbox_stage(
  p_action text, p_task text default null, p_version integer default null,
  p_request uuid default null, p_evidence text default null, p_target uuid default null,
  p_outcome jsonb default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  result jsonb;
  recorded jsonb;
begin
  if actor_id is null or auth.jwt()->>'aal' is distinct from 'aal2'
    or not exists (select from blackbox.control where enabled) then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select role into actor_role from blackbox.principals where id=actor_id;
  if actor_role is null then raise exception 'Access denied' using errcode='42501'; end if;
  if p_action='approve' then
    if jsonb_typeof(p_outcome) is distinct from 'object' or length(p_outcome::text)>6000 then
      raise exception 'Structured outcome required' using errcode='22023';
    end if;
    if exists (select from jsonb_each(p_outcome) e where
      e.key not in ('conclusion','rootCause','fix','tests','deployment','rollback','runbook','confidence')
      or jsonb_typeof(e.value)<>'string')
      or coalesce(length(btrim(p_outcome->>'conclusion')),0)=0
      or coalesce(p_outcome->>'confidence','') not in ('low','medium','high') then
      raise exception 'Invalid outcome' using errcode='22023';
    end if;
  elsif p_outcome is not null then
    raise exception 'Unexpected outcome' using errcode='22023';
  end if;
  result := blackbox.blackbox_stage(p_action,p_task,p_version,p_request,p_evidence,p_target);
  if p_action='list' then
    return result || jsonb_build_object('role',actor_role,'tasks',coalesce((
      select jsonb_agg(t.value || jsonb_build_object('outcomes',coalesce((
        select jsonb_agg(m.outcome || jsonb_build_object(
          'reviewedAt',e.observed_at,'version',m.version,
          'verification','independent synthetic review',
          'sourceIncident',t.value->'proposal'->'incident'->>'id') order by m.version)
        from blackbox.memory m join blackbox.events e using(task_id,version)
        where m.task_id=t.value->>'id'
      ),'[]'::jsonb)) order by t.ordinality)
      from jsonb_array_elements(result->'tasks') with ordinality t
    ),'[]'::jsonb));
  end if;
  if p_action='approve' then
    if (result->>'duplicate')::boolean then
      select outcome into recorded from blackbox.memory
        where task_id=p_task and version=(result->>'version')::integer;
      if recorded is distinct from p_outcome then
        raise exception 'Outcome retry conflict' using errcode='23505';
      end if;
    else
      insert into blackbox.memory values (p_task,(result->>'version')::integer,p_outcome);
    end if;
  end if;
  return result;
end;
$$;
revoke all on function public.blackbox_stage(text,text,integer,uuid,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.blackbox_stage(text,text,integer,uuid,text,uuid,jsonb) to authenticated;
commit;
