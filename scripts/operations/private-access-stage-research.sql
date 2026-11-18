-- Additive restrictions on the verified synthetic database only. Existing entitlement
-- and age policies remain authoritative. Never install against production.
do $restrict_research$
declare target text;
begin
  foreach target in array array[
    'public.games', 'public.nba_games', 'public.nba_observations',
    'public.analysis_versions', 'public.market_snapshots', 'public.published_legs',
    'public.research_feed_posts', 'public.source_observations',
    'vq_fixture.sports', 'vq_fixture.posts'
  ] loop
    if to_regclass(target) is null then raise exception 'Missing isolated contract table: %', target; end if;
    execute format('create policy stage_private_research on %s as restrictive for select to authenticated using ((select vq_private_access_stage.dealer_research_allowed()))', target);
    execute format('create policy stage_private_anonymous on %s as restrictive for select to anon using (false)', target);
  end loop;
end
$restrict_research$;
