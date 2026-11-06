-- Story-only trusted time anchor. No post, photo, feed, policy or publication changes.
-- statement_timestamp(), rather than transaction-start now(), avoids an old transaction clock.
create function public.community_story_clock() returns jsonb
language sql stable security invoker set search_path = '' as $$
 select case when auth.uid() is not null then
  jsonb_build_object('version', 1, 'server_now', statement_timestamp())
 else null end
$$;
revoke all on function public.community_story_clock() from public, anon, authenticated;
grant execute on function public.community_story_clock() to authenticated;
