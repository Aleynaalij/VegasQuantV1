-- Isolated validation project only, after Phase 3 stability.
begin;
create table blackbox.execution_packages (
 id uuid primary key,
 task_id text not null,
 outcome_version integer not null,
 agent uuid not null references blackbox.principals(id),
 planner uuid not null,
 specification jsonb not null,
 state text not null default 'proposed',
 version integer not null default 0,
 evidence jsonb,
 evidence_digest text,
 foreign key(task_id,outcome_version) references blackbox.memory(task_id,version)
);
create table blackbox.execution_events (
 package_id uuid references blackbox.execution_packages(id),
 version integer,
 actor uuid not null,
 action text not null,
 request uuid not null,
 payload jsonb not null,
 recorded_at timestamptz not null default clock_timestamp(),
 primary key(package_id,version),
 unique(actor,request)
);
alter table blackbox.execution_packages enable row level security;
alter table blackbox.execution_events enable row level security;
revoke all on blackbox.execution_packages,blackbox.execution_events from public,anon,authenticated,service_role;

create function public.blackbox_execution(
 p_action text,p_id uuid default null,p_version integer default null,
 p_request uuid default null,p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor_id uuid := auth.uid();
 actor_role text;
 pkg blackbox.execution_packages%rowtype;
 prior blackbox.execution_events%rowtype;
 next_state text;
 candidate jsonb;
begin
 -- Existing Phase 3 read checks live session, AAL2, enrollment and kill switch.
 actor_role:=blackbox.intelligence_before_stability('page',null,null,null,null,null,null)->>'role';
 if p_action='list' then
   return jsonb_build_object('role',actor_role,'packages',coalesce((
    select jsonb_agg(to_jsonb(p)-'planner' || jsonb_build_object('history',coalesce((
      select jsonb_agg(to_jsonb(e)-'actor'-'request' order by e.version)
      from blackbox.execution_events e where e.package_id=p.id),'[]')))
    from (select * from blackbox.execution_packages
      where actor_role in ('admin','reviewer') or agent=actor_id order by id limit 25) p),'[]'));
 end if;
 if p_id is null or p_request is null or p_version is null or p_version<0
   or jsonb_typeof(p_payload) is distinct from 'object' or length(p_payload::text)>12000 then
   raise exception 'Invalid command' using errcode='22023';
 end if;
 -- Serialize retries across all packages for this authenticated actor/request.
 perform pg_advisory_xact_lock(hashtextextended(actor_id::text||':'||p_request::text,0));
 select * into prior from blackbox.execution_events where actor=actor_id and request=p_request;
 if found then
   if prior.package_id=p_id and prior.action=p_action and prior.payload=p_payload and prior.version=p_version+1 then
     return jsonb_build_object('version',prior.version,'duplicate',true);
   end if;
   raise exception 'Changed replay' using errcode='23505';
 end if;
 if p_action='propose' and actor_role='admin' and p_version=0 then
   if not exists(select from blackbox.principals where id=(p_payload->>'agent')::uuid and role in ('codex','claude')) then
     raise exception 'Invalid agent' using errcode='22023';
   end if;
   insert into blackbox.execution_packages(id,task_id,outcome_version,agent,planner,specification)
   select p_id,t.id,m.version,(p_payload->>'agent')::uuid,actor_id,
     jsonb_build_object('sourceTask',t.id,'sourceIncident',t.proposal->'incident'->>'id',
       'evidenceAnchor',t.proposal->>'evidenceAnchor','verifiedConclusion',m.outcome->>'conclusion',
       'observations',t.proposal->'facts','hypotheses',t.proposal->'hypotheses',
       'steps',t.proposal->'investigation','acceptance',t.proposal->'acceptance',
       'components',jsonb_build_array('tests/blackbox-execution.test.ts'),
       'dependencies',coalesce((select jsonb_agg(dependency_id order by dependency_id) from blackbox.dependency_edges where task_id=t.id),'[]'),
       'tests',jsonb_build_array('unit','build','exact-head CI'),
       'risk','isolated synthetic work','rollback','discard dry-run workspace',
       'approvals',jsonb_build_array('execution','repository write','pull request','merge','production deployment','database change','security policy change'))
   from blackbox.memory m join blackbox.tasks t on t.id=m.task_id
   join blackbox.events e on e.task_id=m.task_id and e.version=m.version
   where t.id=p_payload->>'task' and m.version=(p_payload->>'outcomeVersion')::integer
     and t.status='completed' and e.action='approve' and e.role='reviewer';
   if not found then raise exception 'Reviewed source required' using errcode='22023'; end if;
   next_state:='proposed';
 else
   select * into pkg from blackbox.execution_packages where id=p_id for update;
   if not found or (actor_role in ('codex','claude') and pkg.agent<>actor_id) then
     raise exception 'Access denied' using errcode='42501';
   end if;
   if pkg.version<>p_version then raise exception 'Stale package version' using errcode='23505'; end if;
   if p_action='authorize' and actor_role='admin' and pkg.state='proposed'
      and p_payload='{"scope":"execution"}'::jsonb then next_state:='authorized';
   elsif p_action='revoke' and actor_role='admin' and pkg.state in ('authorized','acknowledged','submitted')
      and length(btrim(coalesce(p_payload->>'reason','')))>0 then next_state:='revoked';
   elsif p_action='acknowledge' and actor_role in ('codex','claude') and pkg.agent=actor_id
      and pkg.state='authorized' and p_payload='{}' then next_state:='acknowledged';
   elsif p_action='submit' and actor_role in ('codex','claude') and pkg.agent=actor_id and pkg.state='acknowledged' then
     candidate:=p_payload;
     if coalesce(candidate->>'commit','') !~ '^[a-f0-9]{40}$'
        or candidate->>'commit' is distinct from repeat('4',40)
       or candidate->>'ciHead' is distinct from candidate->>'commit'
       or candidate->>'source' is distinct from 'synthetic dry run'
       or candidate->'files' is distinct from pkg.specification->'components'
       or candidate->>'unit' is distinct from 'pass'
       or candidate->>'build' is distinct from 'pass'
       or candidate->>'ci' is distinct from 'pass'
       or candidate->>'rollback' is distinct from pkg.specification->>'rollback'
       or candidate->>'acceptance' is distinct from 'fixture exercised' then
       raise exception 'Evidence mismatch' using errcode='22023';
     end if;
     pkg.evidence:=candidate;
     pkg.evidence_digest:=encode(sha256(convert_to(candidate::text,'UTF8')),'hex');
     next_state:='submitted';
   elsif p_action in ('approve','reject') and actor_role='reviewer' and actor_id<>pkg.agent and actor_id<>pkg.planner
      and pkg.state='submitted' and length(btrim(coalesce(p_payload->>'reason','')))>0 then
     if p_action='approve' and (p_payload->>'digest' is distinct from pkg.evidence_digest
       or pkg.evidence_digest is distinct from encode(sha256(convert_to(pkg.evidence::text,'UTF8')),'hex')
       or not exists(select from blackbox.execution_events e where e.package_id=p_id and e.action='submit'
         and e.recorded_at>statement_timestamp()-interval '24 hours')) then
       raise exception 'Stale or altered evidence' using errcode='22023';
     end if;
     next_state:=case when p_action='approve' then 'approved' else 'rejected' end;
   else raise exception 'Action denied' using errcode='42501';
   end if;
 end if;
 update blackbox.execution_packages set version=p_version+1,state=next_state,
   evidence=pkg.evidence,evidence_digest=pkg.evidence_digest where id=p_id;
 insert into blackbox.execution_events(package_id,version,actor,action,request,payload)
 values(p_id,p_version+1,actor_id,p_action,p_request,p_payload);
 return jsonb_build_object('version',p_version+1,'state',next_state);
end;
$$;
revoke all on function public.blackbox_execution(text,uuid,integer,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.blackbox_execution(text,uuid,integer,uuid,jsonb) to authenticated;
commit;
