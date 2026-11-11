-- Resolve stable author links without loosening the existing profile visibility checks.
-- Preserve the live function body, grants, fields and follow behavior; fail on unexpected drift.
do $migration$
declare
 definition text := pg_get_functiondef('public.community_profile(text,integer)'::regprocedure);
 needle text := 'where lower(cp.username) = lower(p_username)';
 replacement text := $lookup$where case
   when p_username ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     then cp.user_id::text = lower(p_username)
   else lower(cp.username) = lower(p_username)
 end$lookup$;
begin
 if position(needle in definition) = 0 then
   raise exception 'community_profile lookup changed; review before applying';
 end if;
 execute replace(definition, needle, replacement);
end $migration$;
