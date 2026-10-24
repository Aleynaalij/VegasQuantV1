-- Card revisions stay append-only, but account erasure must still work. The shared
-- private.immutable() always raises, so the revision trigger blocked both erasure paths:
--  * deleting a contributor cascades auth.users -> ruby_contributors -> ruby_submissions -> revisions;
--  * deleting the editing admin sets ruby_card_revisions.edited_by to null.
-- This guard allows exactly those two foreign-key actions and nothing else: a delete only once the
-- revision's card no longer exists, and an update only when the sole change nulls edited_by for an
-- editor whose account no longer exists. Any other update or delete still raises.
create or replace function private.guard_ruby_revision() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' and not exists(select 1 from public.ruby_submissions s where s.id=old.submission_id) then
  return old;
 end if;
 if tg_op='UPDATE' and old.edited_by is not null and new.edited_by is null
    and (to_jsonb(new)-'edited_by')=(to_jsonb(old)-'edited_by')
    and not exists(select 1 from auth.users u where u.id=old.edited_by) then
  return new;
 end if;
 raise exception 'Card revisions are immutable. Add a new revision instead.';
end $$;
revoke all on function private.guard_ruby_revision() from public,anon,authenticated;
drop trigger if exists immutable_ruby_revision on public.ruby_card_revisions;
create trigger immutable_ruby_revision before update or delete on public.ruby_card_revisions
 for each row execute function private.guard_ruby_revision();
