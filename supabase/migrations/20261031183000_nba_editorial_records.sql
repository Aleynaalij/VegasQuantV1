-- Current NBA editorial publications only; reuse the existing confirmed-result grader.
-- This is a read projection, not a result/stake/bankroll mutation or model record.
create function public.nba_editorial_records() returns jsonb
language sql stable security invoker set search_path='' as $$
 with current_picks as (
  select p.* from public.nba_editorial_picks p
  where not exists(select 1 from public.nba_editorial_picks newer where newer.supersedes_id=p.id)
 ), grades as (
  select case when r.status='FINAL' and g.status='STATUS_FINAL' then public.nba_grade(p.game_id,p.market,p.direction,p.line,p.player)
    else 'PENDING' end as grade, r.status
  from current_picks p join public.nba_games g on g.id=p.game_id left join public.nba_result_progress r on r.game_id=p.game_id
 )
 select jsonb_build_object('selections',count(*),'win',count(*) filter(where grade='WIN'),
  'loss',count(*) filter(where grade='LOSS'),'push',count(*) filter(where grade='PUSH'),
  'void',count(*) filter(where grade='VOID'),
  'pending',count(*) filter(where grade not in ('WIN','LOSS','PUSH','VOID') or grade is null),
  'review',count(*) filter(where status='CONFLICT' or grade='REVIEW')) from grades
$$;
revoke all on function public.nba_editorial_records() from public;
grant execute on function public.nba_editorial_records() to anon,authenticated,service_role;
