-- Draft-only structured support queue. No provider, notification, or outbound action.
create table private.operations_tickets (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  feature text not null check (feature in ('account','research','zone','records','other')),
  symptom text not null check (symptom in ('unavailable','incorrect','slow','other')),
  status text not null default 'new' check (status in ('new','in_review','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reporter_id, request_id)
);
create index operations_tickets_reporter_time on private.operations_tickets(reporter_id, created_at desc);
create index operations_tickets_recent on private.operations_tickets(created_at desc, id desc);

create table private.operations_ticket_events (
  ticket_id uuid not null references private.operations_tickets(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('submitted','triaged','resolved')),
  status text not null check (status in ('new','in_review','resolved')),
  created_at timestamptz not null default now(),
  primary key (ticket_id, action)
);
alter table private.operations_tickets enable row level security;
alter table private.operations_ticket_events enable row level security;
revoke all on private.operations_tickets, private.operations_ticket_events
  from public, anon, authenticated, service_role;

create function private.operations_support(
  p_action text, p_id uuid default null, p_feature text default null,
  p_symptom text default null, p_expected text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  session_key text := auth.jwt()->>'session_id';
  ticket private.operations_tickets;
  next_status text;
begin
  if actor is null or session_key is null
     or session_key !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
     or auth.jwt()->>'is_anonymous' = 'true' then
    return '{"state":"forbidden"}';
  end if;
  if not exists (
    select 1 from auth.users u
    join auth.sessions s on s.user_id = u.id and s.id = session_key::uuid
    where u.id = actor and u.email_confirmed_at is not null
      and not coalesce(u.is_anonymous, false)
      and (u.banned_until is null or u.banned_until <= now())
      and (s.not_after is null or s.not_after > now())
      and not exists (select 1 from private.account_erasure_jobs e where e.user_id = actor and e.expires_at > now())
  ) or private.age_member_allowed() is distinct from true then
    return '{"state":"forbidden"}';
  end if;

  if p_action = 'submit' then
    if p_id is null or p_feature is null or p_symptom is null
       or p_feature not in ('account','research','zone','records','other')
       or p_symptom not in ('unavailable','incorrect','slow','other') then
      return '{"state":"invalid"}';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('operations-support:' || actor::text, 0));
    select * into ticket from private.operations_tickets where reporter_id = actor and request_id = p_id;
    if found then
      if ticket.feature <> p_feature or ticket.symptom <> p_symptom then
        return '{"state":"conflict"}';
      end if;
    else
      if (select count(*) from (select 1 from private.operations_tickets
          where reporter_id = actor and created_at > now() - interval '1 hour' limit 5) recent) >= 5 then
        return '{"state":"limit"}';
      end if;
      insert into private.operations_tickets(reporter_id, request_id, feature, symptom)
        values (actor, p_id, p_feature, p_symptom) returning * into ticket;
      insert into private.operations_ticket_events(ticket_id, actor_id, action, status)
        values (ticket.id, actor, 'submitted', 'new');
    end if;
    return jsonb_build_object('state','submitted','id',ticket.id);
  end if;

  if private.is_admin() is distinct from true then return '{"state":"forbidden"}'; end if;
  if p_action = 'list' then
    return jsonb_build_object('state','ready','tickets',coalesce((
      select jsonb_agg(to_jsonb(t) order by t.created_at desc, t.id desc)
      from (select id, feature, symptom, status, created_at, updated_at from private.operations_tickets
        order by created_at desc, id desc limit 50) t
    ),'[]'::jsonb));
  end if;
  if p_action is null or p_action not in ('detail','triage') or p_id is null then
    return '{"state":"invalid"}';
  end if;
  if p_action = 'triage' then
    next_status := case p_expected when 'new' then 'in_review' when 'in_review' then 'resolved' end;
    if next_status is null then return '{"state":"invalid"}'; end if;
    update private.operations_tickets set status = next_status, updated_at = now()
      where id = p_id and status = p_expected returning * into ticket;
    if not found then return '{"state":"conflict"}'; end if;
    insert into private.operations_ticket_events(ticket_id, actor_id, action, status)
      values (ticket.id, actor, case when next_status = 'in_review' then 'triaged' else 'resolved' end, next_status);
  else
    select * into ticket from private.operations_tickets where id = p_id;
    if not found then return '{"state":"not_found"}'; end if;
  end if;
  return jsonb_build_object('state','ready', 'ticket',jsonb_build_object(
    'id',ticket.id,'feature',ticket.feature,'symptom',ticket.symptom,'status',ticket.status,
    'created_at',ticket.created_at,'updated_at',ticket.updated_at),
    'events',(select jsonb_agg(jsonb_build_object('action',action,'status',status,'created_at',created_at)
      order by created_at, case action when 'submitted' then 0 when 'triaged' then 1 else 2 end)
      from private.operations_ticket_events where ticket_id = ticket.id));
end $$;

create function public.operations_support(
  p_action text, p_id uuid default null, p_feature text default null,
  p_symptom text default null, p_expected text default null
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.operations_support(p_action,p_id,p_feature,p_symptom,p_expected);
$$;
revoke all on function private.operations_support(text,uuid,text,text,text),
  public.operations_support(text,uuid,text,text,text) from public, anon, authenticated, service_role;
grant execute on function private.operations_support(text,uuid,text,text,text),
  public.operations_support(text,uuid,text,text,text) to authenticated;
