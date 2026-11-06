-- PREPARED ONLY. Explicitly approved rollback of the temporary pause only.
-- This re-enables prior source-link writes; coordinate the app rollback separately.
-- No original migration, RPC, permission, row or history is removed/recreated.
begin;
drop trigger kalshi_submission_pause on public.ruby_submissions;
drop trigger kalshi_revision_pause on public.ruby_card_revisions;
drop function private.guard_kalshi_submission_pause();
drop function private.guard_kalshi_revision_pause();
commit;
