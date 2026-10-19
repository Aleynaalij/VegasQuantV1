-- GitHub runs the NBA shadow scan's 15-minute schedule only every 2 to 5 hours (11 runs between
-- Oct 17 21:42Z and Oct 19 05:17Z). A FanDuel props snapshot is fetched at most every 30 minutes to 6
-- hours and the scan only accepts quotes received within 30 minutes, so the first opening-night props
-- (Oct 19 07:02Z) were never scanned. Supabase's scheduler now starts the workflow three minutes after
-- each nba-sync run, but only when a fresh FanDuel points or rebounds snapshot exists for an upcoming
-- regular-season game. GitHub's own schedule stays as a backup.
--
-- It reuses the fine-grained token the owner stored in Supabase Vault for the research board
-- ('github_research_board_token': this repository only, Actions read and write). The token never
-- appears in code or migrations; without it the job does nothing.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function private.dispatch_nba_shadow_scan() returns boolean
language plpgsql security definer set search_path='' as $$
declare token text;
begin
 if not exists (
  select 1 from public.nba_observations o join public.nba_games g on g.id = o.game_id
  where o.kind = 'prop' and o.recorded_at > now() - interval '15 minutes'
   and o.payload->>'book' = 'FanDuel' and o.payload->>'market' in ('player_points', 'player_rebounds')
   and g.season_type = 2 and not g.tipoff_tbd and g.tipoff > now() and g.tipoff <= now() + interval '36 hours')
 then return false; end if;
 select decrypted_secret into token from vault.decrypted_secrets where name = 'github_research_board_token' limit 1;
 if token is null or token = '' then return false; end if;
 perform net.http_post(
  url := 'https://api.github.com/repos/Aleynaalij/VegasQuantV1/actions/workflows/nba-shadow-scan.yml/dispatches',
  body := jsonb_build_object('ref', 'main'),
  headers := jsonb_build_object(
   'Authorization', 'Bearer ' || token,
   'Accept', 'application/vnd.github+json',
   'X-GitHub-Api-Version', '2022-11-28',
   'User-Agent', 'vegas-quant-nba-shadow-scan',
   'Content-Type', 'application/json'));
 return true;
end $$;
revoke all on function private.dispatch_nba_shadow_scan() from public, anon, authenticated, service_role;

do $$
begin
 if exists (select 1 from cron.job where jobname = 'nba-shadow-scan-dispatch') then
  perform cron.unschedule('nba-shadow-scan-dispatch');
 end if;
 perform cron.schedule('nba-shadow-scan-dispatch', '5,20,35,50 * * * *', 'select private.dispatch_nba_shadow_scan()');
end $$;
