-- The research-board trigger condition calls private.is_research_release with the inserting role's
-- privileges, so a service-role insert into candidate_releases failed with "permission denied for
-- function". The function is a pure check of its argument and reads no data.
grant execute on function private.is_research_release(jsonb) to service_role;
