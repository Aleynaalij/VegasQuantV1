-- GitHub delays or drops scheduled workflow runs under load (the hourly research-board schedule
-- started 2 of 10 times overnight). Supabase's own scheduler now asks GitHub to start the
-- workflow every hour at :07 (GitHub's schedule stays as a backup at :37). Runs are marked
-- scheduled, so the script still publishes at most once every 2.5 hours.
--
-- The GitHub token never appears in code or migrations: the owner stores a fine-grained token
-- (this repository only, Actions: read and write) in Supabase Vault as
-- 'github_research_board_token'. Until it exists the job does nothing.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function private.dispatch_research_board() returns void
language plpgsql security definer set search_path='' as $$
declare token text;
begin
 select decrypted_secret into token from vault.decrypted_secrets where name='github_research_board_token' limit 1;
 if token is null or token = '' then return; end if;
 perform net.http_post(
  url := 'https://api.github.com/repos/Aleynaalij/VegasQuantV1/actions/workflows/research-board.yml/dispatches',
  body := jsonb_build_object('ref','main','inputs',jsonb_build_object('scheduled','true')),
  headers := jsonb_build_object(
   'Authorization','Bearer '||token,
   'Accept','application/vnd.github+json',
   'X-GitHub-Api-Version','2022-11-28',
   'User-Agent','vegas-quant-research-board',
   'Content-Type','application/json'));
end $$;
revoke all on function private.dispatch_research_board() from public, anon, authenticated, service_role;

do $$
begin
 if exists (select 1 from cron.job where jobname='research-board-dispatch') then
  perform cron.unschedule('research-board-dispatch');
 end if;
 perform cron.schedule('research-board-dispatch', '7 * * * *', 'select private.dispatch_research_board()');
end $$;
