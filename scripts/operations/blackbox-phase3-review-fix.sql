-- Isolated staging only, after blackbox-phase3.sql.
create or replace function public.blackbox_intelligence(
  p_action text, p_task text default null, p_dependency text default null,
  p_version integer default null, p_present boolean default null, p_after text default null,
  p_review jsonb default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  session_key text := auth.jwt()->>'session_id';
  next_version integer;
  stamp timestamptz := statement_timestamp();
  slate date := (stamp at time zone 'America/New_York')::date;
begin
  if actor_id is null or auth.jwt()->>'aal' is distinct from 'aal2' or auth.jwt()->>'is_anonymous'='true'
    or session_key is null or session_key !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    or not exists(select from blackbox.control where enabled) then
    raise exception 'Access denied' using errcode='42501';
  end if;
  perform 1 from auth.users u join auth.sessions s on s.user_id=u.id
  where u.id=actor_id and s.id=session_key::uuid and u.email_confirmed_at is not null
    and not coalesce(u.is_anonymous,false)
    and (u.banned_until is null or u.banned_until<=stamp)
    and (s.not_after is null or s.not_after>stamp)
    and not exists(select from private.account_erasure_jobs e where e.user_id=actor_id and e.expires_at>stamp)
  for key share of s;
  if not found then raise exception 'Access denied' using errcode='42501'; end if;
  select role into actor_role from blackbox.principals where id=actor_id;
  if actor_role is null then raise exception 'Access denied' using errcode='42501'; end if;
  if p_action='page' then
    return (with page as (
      select t.* from blackbox.tasks t where (p_after is null or t.id>p_after)
        and (actor_role in ('admin','reviewer') or t.assignee=actor_id) order by t.id limit 26
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
              exists(select from blackbox.tasks dt where dt.id=d.dependency_id and dt.assignee=actor_id))), '[]'),
          'hidden_dependencies',exists(select from blackbox.dependency_edges d where d.task_id=t.id and
             actor_role in ('codex','claude') and not exists(select from blackbox.tasks dt where dt.id=d.dependency_id and dt.assignee=actor_id)),
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
      values(p_task,next_version,p_dependency,p_present,actor_id);
    return jsonb_build_object('version',next_version);
  end if;

  if p_action='review' and actor_role='reviewer' then
    if jsonb_typeof(p_review) is distinct from 'object' or length(p_review::text)>4000 then
      raise exception 'Invalid improvement review' using errcode='22023';
    end if;
    perform 1 from blackbox.tasks where id=p_task for update;
    if not found or not exists(select from blackbox.memory m join blackbox.events e using(task_id,version)
      where m.task_id=p_task and m.version=p_version and e.action='approve' and e.role='reviewer')
      or exists(select from blackbox.events where task_id=p_task and blackbox.events.actor=actor_id
        and action in ('assign','handoff','acknowledge','submit')) then
      raise exception 'Access denied' using errcode='42501';
    end if;
    select coalesce(max(revision),0)+1 into next_version from blackbox.improvement_reviews
      where task_id=p_task and outcome_version=p_version;
    insert into blackbox.improvement_reviews(task_id,outcome_version,revision,actor,recommendation,classification,effectiveness,evidence)
      values(p_task,p_version,next_version,actor_id,p_review->>'recommendation',p_review->>'classification',p_review->>'effectiveness',p_review->>'evidence');
    return jsonb_build_object('revision',next_version);
  end if;

  if p_action='briefing' and actor_role='admin' then
    perform pg_advisory_xact_lock(676304);
    select coalesce(max(version),0)+1 into next_version from blackbox.briefings where day=slate;
    insert into blackbox.briefings
    select slate,next_version,actor_id,stamp,jsonb_build_object('policy','phase3-v2','source','synthetic staging ledger',
      'tasks',coalesce(jsonb_agg(jsonb_build_object('id',t.id,'version',t.version,'status',t.status,
        'observedAt',t.proposal->'incident'->'evidence'->>'observedAt','evidenceAnchor',t.proposal->>'evidenceAnchor',
        'reviewed',exists(select from blackbox.memory m where m.task_id=t.id)) order by t.id),'[]'))
    from blackbox.tasks t;
    return jsonb_build_object('day',slate,'version',next_version);
  end if;
  raise exception 'Access denied' using errcode='42501';
end;
$$;
