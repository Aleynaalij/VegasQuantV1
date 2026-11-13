-- Review artifact. Install only in an isolated database for preview testing.
begin;
create function public.nba_publication_evidence() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  observed timestamptz := statement_timestamp();
  slate date := (observed at time zone 'America/New_York')::date;
  start_at timestamptz := slate::timestamp at time zone 'America/New_York';
  end_at timestamptz := (slate + 1)::timestamp at time zone 'America/New_York';
  publisher uuid;
  journal private.nba_threes_posts;
begin
  -- Reuse the complete current-session and MFA admin check, via its read path.
  if (private.operations_support('list')->>'state') is distinct from 'ready' then
    return null;
  end if;
  select user_id into publisher from private.zone_automation where name = 'nba_threes';
  select * into journal from private.nba_threes_posts where day = slate;
  return jsonb_build_object(
    'slate', slate, 'checkedAt', observed,
    'schedule', (select jsonb_build_object('expression', j.schedule,
      'timezone', coalesce(current_setting('cron.timezone', true), 'unknown'),
      'active', j.active) from cron.job j where j.jobname = 'nba-threes-post'),
    'runs', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from (
      select d.start_time as "startedAt", d.end_time as "completedAt", d.status
      from cron.job j join cron.job_run_details d using (jobid)
      where j.jobname = 'nba-threes-post' and d.start_time >= start_at and d.start_time < end_at
      order by d.start_time desc limit 3
    ) r),
    'scheduleFeedAt', (select case when f.status = 'ok'
        and to_char(slate,'YYYYMMDD') between replace(f.details->'dates'->>0,'-','') and replace(f.details->'dates'->>1,'-','')
        then f.created_at end
      from public.feed_runs f where f.provider = 'ESPN NBA'
      order by f.created_at desc, f.id desc limit 1),
    -- Current ingestion stores a batch date range, with no explicit per-slate completeness attestation.
    'slateCoverage', null,
    'eligibleGames', (select count(*) from public.nba_games g
      where g.season_type = 2 and g.tipoff >= start_at and g.tipoff < end_at),
    'journal', case when journal.day is not null then jsonb_build_object(
      'slate',journal.day,'status',journal.status,'postId',journal.post_id,'observedAt',journal.updated_at,
      'skipReason', case when journal.status = 'SKIPPED' then case journal.detail
        when 'No player on today''s teams has 3 games with recorded attempts' then 'insufficient_player_history'
        when 'No Zone author configured' then 'publisher_unavailable'
        else 'unexplained' end end,
      'skipPublisherVerified', case when journal.status = 'SKIPPED'
        then coalesce(private.is_dealer_publisher(publisher), false) end) end,
    'posts', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from (
      select c.id, c.created_at as "publishedAt",
        coalesce(c.user_id = publisher and private.is_dealer_publisher(c.user_id), false) as dealer,
        coalesce(c.card = 'nba-threes:' || slate and c.sport = 'nba' and c.kind = 'talk'
          and c.legs = '[]'::jsonb and c.stake is null and c.photo_path is null
          and c.title = '3-point volume · ' || trim(to_char(slate, 'Dy Mon FMDD'))
          and c.body like '%Most 3s attempted per game%'
          and c.body like '%Most 3s made per game%'
          and c.body like '%Research only, not picks. Box scores: ESPN.', false) as "contentMatches"
      from public.community_posts c
      where c.id = journal.post_id or c.card = 'nba-threes:' || slate
      order by c.created_at desc, c.id limit 2
    ) p)
  );
end $$;
revoke all on function public.nba_publication_evidence() from public, anon, authenticated, service_role;
grant execute on function public.nba_publication_evidence() to authenticated;
commit;
