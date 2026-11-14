-- Isolated staging only. Install after blackbox-active-session.sql.
begin;
create table blackbox.dependency_events (
  task_id text references blackbox.tasks(id),
  version integer,
  dependency_id text not null references blackbox.tasks(id),
  present boolean not null,
  actor uuid not null,
  recorded_at timestamptz not null default clock_timestamp(),
  primary key(task_id,version),
  check(task_id<>dependency_id)
);
create table blackbox.briefings (
  day date,
  version integer,
  actor uuid not null,
  captured_at timestamptz not null,
  summary jsonb not null,
  primary key(day,version)
);
create table blackbox.agent_profiles (
  principal uuid primary key references blackbox.principals(id),
  capability text not null check(capability in ('publication verification','record reconciliation')),
  verified_at timestamptz not null,
  verified_by uuid not null references blackbox.principals(id)
);
create table blackbox.improvement_reviews (
  task_id text not null,
  outcome_version integer not null,
  revision integer not null,
  actor uuid not null,
  reviewed_at timestamptz not null default clock_timestamp(),
  recommendation text not null check(length(btrim(recommendation)) between 1 and 1500),
  classification text not null check(classification in ('unknown','source coverage','scheduler','publisher','journal','other')),
  effectiveness text not null check(effectiveness in ('unmeasured','verified effective','verified ineffective')),
  evidence text not null check(length(btrim(evidence)) between 1 and 1500),
  primary key(task_id,outcome_version,revision),
  foreign key(task_id,outcome_version) references blackbox.memory(task_id,version)
);
alter table blackbox.dependency_events enable row level security;
alter table blackbox.briefings enable row level security;
alter table blackbox.agent_profiles enable row level security;
alter table blackbox.improvement_reviews enable row level security;
revoke all on blackbox.dependency_events,blackbox.briefings,blackbox.agent_profiles,blackbox.improvement_reviews from public,anon,authenticated,service_role;
create index blackbox_tasks_assignee_id on blackbox.tasks(assignee,id);
create view blackbox.dependency_edges as
select task_id,dependency_id from (
  select distinct on(task_id,dependency_id) task_id,dependency_id,present
  from blackbox.dependency_events order by task_id,dependency_id,version desc
) latest where present;
revoke all on blackbox.dependency_edges from public,anon,authenticated,service_role;

create function blackbox.check_assignment_dependencies() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='assigned' and old.status is distinct from new.status then
    perform pg_advisory_xact_lock(676303);
    if exists(with recursive required(id) as (
      select dependency_id from blackbox.dependency_edges where task_id=new.id
      union select d.dependency_id from blackbox.dependency_edges d join required r on d.task_id=r.id
    ) select from required r join blackbox.tasks t on t.id=r.id
    where t.status<>'completed' or not exists(select from blackbox.memory m where m.task_id=t.id)) then
      raise exception 'Unreviewed dependency' using errcode='40001';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function blackbox.check_assignment_dependencies() from public,anon,authenticated,service_role;
create trigger blackbox_check_assignment before update of status on blackbox.tasks
for each row execute function blackbox.check_assignment_dependencies();

create function public.blackbox_intelligence(
  p_action text, p_task text default null, p_dependency text default null,
  p_version integer default null, p_present boolean default null, p_after text default null,
  p_review jsonb default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  actor_role text;
  session_key text := auth.jwt()->>'session_id';
  next_version integer;
  stamp timestamptz := statement_timestamp();
  slate date := (stamp at time zone 'America/New_York')::date;
begin
  if actor is null or auth.jwt()->>'aal' is distinct from 'aal2' or auth.jwt()->>'is_anonymous'='true'
    or session_key is null or session_key !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    or not exists(select from blackbox.control where enabled) then
    raise exception 'Access denied' using errcode='42501';
  end if;
  perform 1 from auth.users u join auth.sessions s on s.user_id=u.id
  where u.id=actor and s.id=session_key::uuid and u.email_confirmed_at is not null
    and not coalesce(u.is_anonymous,false)
    and (u.banned_until is null or u.banned_until<=stamp)
    and (s.not_after is null or s.not_after>stamp)
    and not exists(select from private.account_erasure_jobs e where e.user_id=actor and e.expires_at>stamp)
  for key share of s;
  if not found then raise exception 'Access denied' using errcode='42501'; end if;
  select role into actor_role from blackbox.principals where id=actor;
  if actor_role is null then raise exception 'Access denied' using errcode='42501'; end if;
  if p_action='page' then
    return (with page as (
      select t.* from blackbox.tasks t where (p_after is null or t.id>p_after)
        and (actor_role in ('admin','reviewer') or t.assignee=actor) order by t.id limit 26
    ), visible as (select * from page order by id limit 25)
    select jsonb_build_object(
      'role',actor_role,
      'next',(select case when count(*)>25 then (select max(id) from visible) end from page),
      'tasks',coalesce((select jsonb_agg(
        (to_jsonb(t)-'owner_id'-'submitted_by'-'assignee')
        ||jsonb_build_object(
          'assigned_role',(select role from blackbox.principals where id=t.assignee),
          'dependency_version',coalesce((select max(version) from blackbox.dependency_events where task_id=t.id),0),
          'dependencies',coalesce((select jsonb_agg(d.dependency_id order by d.dependency_id)
            from blackbox.dependency_edges d where d.task_id=t.id and (actor_role in ('admin','reviewer') or
              exists(select from blackbox.tasks dt where dt.id=d.dependency_id and dt.assignee=actor))), '[]'),
          'hidden_dependencies',exists(select from blackbox.dependency_edges d where d.task_id=t.id and
             actor_role in ('codex','claude') and not exists(select from blackbox.tasks dt where dt.id=d.dependency_id and dt.assignee=actor)),
          'history',coalesce((select jsonb_agg(to_jsonb(e)-'actor'-'target'-'request_id' order by e.version) from blackbox.events e where e.task_id=t.id),'[]'),
          'outcomes',coalesce((select jsonb_agg(m.outcome||jsonb_build_object('version',m.version,'reviewedAt',e.observed_at,
             'verification','independent synthetic review','sourceIncident',t.proposal->'incident'->>'id') order by m.version)
             from blackbox.memory m join blackbox.events e using(task_id,version) where m.task_id=t.id),'[]'),
          'reviews',coalesce((select jsonb_agg(to_jsonb(r)-'actor' order by r.outcome_version,r.revision) from blackbox.improvement_reviews r where r.task_id=t.id),'[]')
        ) order by t.id) from visible t),'[]'),
      'agents',case when actor_role='admin' then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'role',p.role,
         'capability',c.capability,'verifiedAt',c.verified_at) order by p.role,p.id) from blackbox.principals p
         left join blackbox.agent_profiles c on c.principal=p.id where p.role in ('codex','claude')),'[]') else '[]'::jsonb end,
      'briefing',case when actor_role in ('admin','reviewer') then
        (select to_jsonb(b)-'actor' from blackbox.briefings b order by day desc,version desc limit 1) end));
  end if;

  if p_action='dependency' and actor_role='admin' then
    if p_task is null or p_dependency is null or p_task=p_dependency or p_version is null or p_present is null
      or not exists(select from blackbox.tasks where id=p_task)
      or not exists(select from blackbox.tasks where id=p_dependency) then
      raise exception 'Invalid dependency' using errcode='22023';
    end if;
    -- Serialize graph edits, including concurrent edges on different tasks.
    perform pg_advisory_xact_lock(676303);
    if p_present and exists(select from blackbox.tasks where id=p_task and status not in ('proposed','blocked')) then
      raise exception 'Dependency changes require proposed or blocked work' using errcode='40001';
    end if;
    select coalesce(max(version),0)+1 into next_version from blackbox.dependency_events where task_id=p_task;
    if p_version<>next_version-1 then raise exception 'Stale graph version' using errcode='40001'; end if;
    if p_present and exists(with recursive reachable(id) as (
      select p_dependency union select d.dependency_id from blackbox.dependency_edges d join reachable r on d.task_id=r.id
    ) select from reachable where id=p_task) then raise exception 'Dependency cycle' using errcode='22023'; end if;
    insert into blackbox.dependency_events(task_id,version,dependency_id,present,actor)
      values(p_task,next_version,p_dependency,p_present,actor);
    return jsonb_build_object('version',next_version);
  end if;

  if p_action='review' and actor_role='reviewer' then
    if jsonb_typeof(p_review) is distinct from 'object' or length(p_review::text)>4000 then
      raise exception 'Invalid improvement review' using errcode='22023';
    end if;
    perform 1 from blackbox.tasks where id=p_task for update;
    if not found or not exists(select from blackbox.memory m join blackbox.events e using(task_id,version)
      where m.task_id=p_task and m.version=p_version and e.action='approve' and e.role='reviewer')
      or exists(select from blackbox.events where task_id=p_task and blackbox.events.actor=blackbox_intelligence.actor
        and action in ('assign','handoff','acknowledge','submit')) then
      raise exception 'Access denied' using errcode='42501';
    end if;
    select coalesce(max(revision),0)+1 into next_version from blackbox.improvement_reviews
      where task_id=p_task and outcome_version=p_version;
    insert into blackbox.improvement_reviews(task_id,outcome_version,revision,actor,recommendation,classification,effectiveness,evidence)
      values(p_task,p_version,next_version,actor,p_review->>'recommendation',p_review->>'classification',p_review->>'effectiveness',p_review->>'evidence');
    return jsonb_build_object('revision',next_version);
  end if;

  if p_action='briefing' and actor_role='admin' then
    perform pg_advisory_xact_lock(676304);
    select coalesce(max(version),0)+1 into next_version from blackbox.briefings where day=slate;
    insert into blackbox.briefings
    select slate,next_version,actor,stamp,jsonb_build_object('policy','phase3-v2','source','synthetic staging ledger',
      'tasks',coalesce(jsonb_agg(jsonb_build_object('id',t.id,'version',t.version,'status',t.status,
        'observedAt',t.proposal->'incident'->'evidence'->>'observedAt','evidenceAnchor',t.proposal->>'evidenceAnchor',
        'reviewed',exists(select from blackbox.memory m where m.task_id=t.id)) order by t.id),'[]'))
    from blackbox.tasks t;
    return jsonb_build_object('day',slate,'version',next_version);
  end if;
  raise exception 'Access denied' using errcode='42501';
end;
$$;
revoke all on function public.blackbox_intelligence(text,text,text,integer,boolean,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.blackbox_intelligence(text,text,text,integer,boolean,text,jsonb) to authenticated;
commit;
