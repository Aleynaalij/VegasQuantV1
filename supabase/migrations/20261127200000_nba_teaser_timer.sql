-- Prop Finder free teaser: GitHub's own schedule for nba-prop-teaser.yml ran once in its first
-- ~9 hours (2026-11-20), so the stored teaser went stale (the UI hides it after 90 minutes).
-- Supabase's scheduler now asks GitHub to start the workflow every 20 minutes, the same way it
-- starts the research board (20261018020000_research_board_timer.sql), with the same Vault token
-- ('github_research_board_token', this repository only, Actions read/write). GitHub's schedule
-- stays as a backup; a duplicate run only rewrites the same single row.
--
-- Only while an NBA regular-season game tips off in the next 36 hours (the window the teaser
-- reads), so no runs are spent on off days.
create or replace function private.dispatch_nba_teaser() returns void
language plpgsql security definer set search_path='' as $$
declare token text;
begin
 if not exists (
  select 1 from public.nba_games
  where season_type = 2 and tipoff > now() and tipoff <= now() + interval '36 hours'
 ) then return; end if;
 select decrypted_secret into token from vault.decrypted_secrets where name='github_research_board_token' limit 1;
 if token is null or token = '' then return; end if;
 perform net.http_post(
  url := 'https://api.github.com/repos/Aleynaalij/VegasQuantV1/actions/workflows/nba-prop-teaser.yml/dispatches',
  body := jsonb_build_object('ref','main'),
  headers := jsonb_build_object(
   'Authorization','Bearer '||token,
   'Accept','application/vnd.github+json',
   'X-GitHub-Api-Version','2022-11-28',
   'User-Agent','vegas-quant-nba-teaser',
   'Content-Type','application/json'));
end $$;
revoke all on function private.dispatch_nba_teaser() from public, anon, authenticated, service_role;

do $$
begin
 if exists (select 1 from cron.job where jobname='nba-teaser-dispatch') then
  perform cron.unschedule('nba-teaser-dispatch');
 end if;
 -- Off the minutes the other dispatchers use (:00/:05 grid, research board :07).
 perform cron.schedule('nba-teaser-dispatch', '13,33,53 * * * *', 'select private.dispatch_nba_teaser()');
end $$;
