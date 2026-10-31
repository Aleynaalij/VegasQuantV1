-- Public default grants inherited anon EXECUTE. Keep privileged code in private;
-- the public invoker wrapper is authenticated-only and the private function still requires admin+age.
alter function public.sports_publish_selection(uuid,text,text,text) set schema private;
create function public.sports_publish_selection(p_market uuid,p_title text,p_why text,p_risk text) returns uuid
language sql security invoker set search_path='' as $$select private.sports_publish_selection(p_market,p_title,p_why,p_risk)$$;
revoke all on function private.sports_publish_selection(uuid,text,text,text),public.sports_publish_selection(uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.sports_publish_selection(uuid,text,text,text),public.sports_publish_selection(uuid,text,text,text) to authenticated;
