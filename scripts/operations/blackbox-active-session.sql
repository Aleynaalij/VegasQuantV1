-- Apply only to the isolated Blackbox validation project.
begin;
alter function public.blackbox_stage(text,text,integer,uuid,text,uuid,jsonb) set schema blackbox;
alter function blackbox.blackbox_stage(text,text,integer,uuid,text,uuid,jsonb) rename to stage_with_memory;
revoke all on function blackbox.stage_with_memory(text,text,integer,uuid,text,uuid,jsonb) from public, anon, authenticated, service_role;
create function public.blackbox_stage(
  p_action text, p_task text default null, p_version integer default null,
  p_request uuid default null, p_evidence text default null, p_target uuid default null,
  p_outcome jsonb default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  session_key text := auth.jwt()->>'session_id';
begin
  if actor is null or auth.jwt()->>'aal' is distinct from 'aal2'
    or auth.jwt()->>'is_anonymous' = 'true'
    or session_key is null or session_key !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
    raise exception 'Access denied' using errcode='42501';
  end if;
  -- Match the Admin Operations account and active session checks. Agent
  -- enrollment uses the existing Blackbox allowlist instead of member age policy.
  perform 1 from auth.users u join auth.sessions s on s.user_id=u.id
    where u.id=actor and s.id=session_key::uuid and u.email_confirmed_at is not null
    and not coalesce(u.is_anonymous,false)
    and (u.banned_until is null or u.banned_until<=statement_timestamp())
    and (s.not_after is null or s.not_after>statement_timestamp())
    and not exists (select from private.account_erasure_jobs e where e.user_id=actor and e.expires_at>statement_timestamp())
    for key share of s;
  if not found then raise exception 'Access denied' using errcode='42501'; end if;
  return blackbox.stage_with_memory(p_action,p_task,p_version,p_request,p_evidence,p_target,p_outcome);
end;
$$;
revoke all on function public.blackbox_stage(text,text,integer,uuid,text,uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.blackbox_stage(text,text,integer,uuid,text,uuid,jsonb) to authenticated;
commit;
