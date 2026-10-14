-- Retain member access and permit only a user's own recorded tails after premium expires.
alter policy progress_read on public.leg_result_progress to authenticated using((select private.age_member_allowed()) and ((select private.has_membership()) or exists(select 1 from public.leg_tails t where t.leg_key=leg_result_progress.leg_key and t.user_id=(select auth.uid()))));
