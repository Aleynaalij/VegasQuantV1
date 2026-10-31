-- NBA live-product rollout: original renderer and author untouched; no model approvals.
-- Do not mark a daily card POSTED while known previous-day finals remain unconfirmed.
alter function private.nba_threes_post() rename to nba_threes_post_before_live_readiness;
create function private.nba_threes_post() returns jsonb language plpgsql security definer set search_path='' as $$
declare today date:=(now() at time zone 'America/New_York')::date;pending integer;
begin
 if exists(select 1 from private.nba_threes_posts where day=today and status='POSTED') then return jsonb_build_object('status','ALREADY_POSTED');end if;
 if not exists(select 1 from public.nba_games where season_type=2 and (tipoff at time zone 'America/New_York')::date=today) then return private.nba_threes_post_before_live_readiness();end if;
 select count(*) into pending from public.nba_games g left join public.nba_result_progress p on p.game_id=g.id
 where g.season_type=2 and (g.tipoff at time zone 'America/New_York')::date=today-1
 and not exists(select 1 from public.nba_game_results r where r.game_id=g.id)
 and coalesce(g.status,'UNKNOWN') not in ('STATUS_CANCELED','STATUS_POSTPONED','STATUS_SUSPENDED')
 and coalesce(p.status,'AWAITING_FINAL')<>'NO_RESULT';
 if pending>0 then
  insert into private.nba_threes_posts(day,status,detail) values(today,'WAITING',pending||' previous-day games await final confirmation')
  on conflict(day) do update set status=excluded.status,detail=excluded.detail,updated_at=now();
  return jsonb_build_object('status','WAITING','pending_final_games',pending);
 end if;
 return private.nba_threes_post_before_live_readiness();
end $$;
revoke all on function private.nba_threes_post(),private.nba_threes_post_before_live_readiness() from public,anon,authenticated,service_role;
-- Restore the original live feed cadence, keeping the existing dispatcher credentials.
select cron.alter_job((select jobid from cron.job where jobname='nba-source-refresh'),schedule:='2,17,32,47 * * * *');
select cron.alter_job((select jobid from cron.job where jobname='nba-results-refresh'),schedule:='5,20,35,50 * * * *');
