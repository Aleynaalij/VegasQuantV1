-- Install only on apwndmcsjxzjxnpxfywo using the staging validation runbook.
begin;
create schema blackbox;
revoke all on schema blackbox from public, anon, authenticated;
create table blackbox.control (singleton boolean primary key check (singleton), enabled boolean not null);
insert into blackbox.control values (true, true);
create table blackbox.principals (
  id uuid primary key references auth.users(id),
  role text not null check (role in ('admin','reviewer','codex','claude'))
);
create table blackbox.tasks (
  id text primary key,
  proposal jsonb not null,
  status text not null default 'proposed',
  version integer not null default 0,
  assignee uuid,
  owner_id uuid,
  submitted_by uuid,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create table blackbox.events (
  task_id text not null references blackbox.tasks(id),
  version integer not null,
  request_id uuid not null,
  actor uuid not null,
  role text not null,
  action text not null,
  target uuid,
  evidence text not null,
  observed_at timestamptz not null default clock_timestamp(),
  primary key (task_id, version),
  unique (actor, request_id)
);
alter table blackbox.control enable row level security;
alter table blackbox.principals enable row level security;
alter table blackbox.tasks enable row level security;
alter table blackbox.events enable row level security;
revoke all on all tables in schema blackbox from public, anon, authenticated;

create function public.blackbox_stage(
  p_action text, p_task text default null, p_version integer default null,
  p_request uuid default null, p_evidence text default null, p_target uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  task blackbox.tasks%rowtype;
  prior blackbox.events%rowtype;
  next_status text;
begin
  if actor_id is null or auth.jwt()->>'aal' is distinct from 'aal2'
    or not exists (select 1 from blackbox.control where enabled) then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  select role into actor_role from blackbox.principals where id = actor_id;
  if actor_role is null then raise exception 'Access denied' using errcode = '42501'; end if;
  if p_action = 'list' then
    return jsonb_build_object(
      'tasks', coalesce((
        select jsonb_agg(to_jsonb(t) - 'owner_id' - 'submitted_by' - 'assignee'
          || jsonb_build_object('assigned_role', (select role from blackbox.principals where id=t.assignee),
            'history', coalesce((select jsonb_agg(to_jsonb(e) - 'actor' - 'target' - 'request_id' order by e.version)
              from blackbox.events e where e.task_id=t.id), '[]'::jsonb)) order by t.updated_at desc, t.id)
        from (select * from blackbox.tasks where actor_role in ('admin','reviewer')
          or assignee=actor_id order by updated_at desc,id limit 50) t
      ), '[]'::jsonb),
      'agents', case when actor_role='admin' then coalesce((select jsonb_agg(jsonb_build_object('id',id,'role',role) order by role,id)
        from blackbox.principals where role in ('codex','claude')), '[]'::jsonb) else '[]'::jsonb end
    );
  end if;
  if p_action is null or p_action not in ('assign','handoff','acknowledge','escalate','submit','approve','reject')
    or p_request is null or p_version is null or p_version < 0
    or coalesce(length(btrim(p_evidence)),0) not between 1 and 1500
    or (p_action in ('assign','handoff')) <> (p_target is not null) then
    raise exception 'Invalid action' using errcode = '22023';
  end if;
  select * into task from blackbox.tasks where id=p_task for update;
  if not found or (actor_role in ('codex','claude') and task.assignee is distinct from actor_id) then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  select * into prior from blackbox.events where actor=actor_id and request_id=p_request;
  if found then
    if prior.task_id=p_task and prior.action=p_action and prior.evidence=p_evidence
      and prior.target is not distinct from p_target and prior.version=p_version+1 then
      return jsonb_build_object('version',prior.version,'duplicate',true);
    end if;
    raise exception 'Request identity conflict' using errcode = '23505';
  end if;
  if task.version <> p_version then raise exception 'Stale version' using errcode = '40001'; end if;
  if p_action in ('assign','handoff') and actor_role='admin'
    and ((p_action='assign' and task.status='proposed')
      or (p_action='handoff' and task.status='blocked' and p_target is distinct from task.assignee))
    and exists (select 1 from blackbox.principals where id=p_target and role in ('codex','claude')) then
    next_status := 'assigned';
    task.assignee := p_target;
    task.owner_id := null;
    task.submitted_by := null;
  elsif p_action='acknowledge' and actor_role in ('codex','claude') and task.assignee=actor_id and task.status='assigned' then
    next_status := 'in_progress';
    task.owner_id := actor_id;
  elsif p_action in ('escalate','submit') and actor_role in ('codex','claude') and task.owner_id=actor_id and task.status='in_progress' then
    next_status := case when p_action='submit' then 'in_review' else 'blocked' end;
    if p_action='submit' then task.submitted_by := actor_id; end if;
  elsif p_action in ('approve','reject') and actor_role='reviewer' and task.status='in_review'
    and task.submitted_by is not null and task.submitted_by<>actor_id
    and not exists (select 1 from blackbox.events where task_id=p_task and actor=actor_id
      and action in ('assign','handoff','acknowledge','submit')) then
    next_status := case when p_action='approve' then 'completed' else 'blocked' end;
  else
    raise exception 'Transition denied' using errcode = '42501';
  end if;
  update blackbox.tasks set status=next_status, version=task.version+1,
    assignee=task.assignee, owner_id=task.owner_id, submitted_by=task.submitted_by,
    updated_at=clock_timestamp() where id=p_task;
  insert into blackbox.events(task_id, version, request_id, actor, role, action, target, evidence)
    values(p_task,task.version+1,p_request,actor_id,actor_role,p_action,p_target,p_evidence);
  return jsonb_build_object('version',task.version+1,'duplicate',false);
end;
$$;
revoke all on function public.blackbox_stage(text,text,integer,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.blackbox_stage(text,text,integer,uuid,text,uuid) to authenticated;
commit;
