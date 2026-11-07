-- PREPARED ONLY: apply only after ruby_kalshi_source_link is installed and reviewed.
-- Pause new links at the storage boundary without rewriting guard-rich RPCs,
-- changing grants, touching historical data, or changing result/visibility semantics.
begin;
do $$
begin
 if to_regprocedure('private.submit_ruby_link(uuid,text,text,jsonb,text,text,text,integer,text)') is null
    or to_regprocedure('private.edit_ruby_link(uuid,integer,text,jsonb,text,text,text,integer,text,text)') is null
    or not exists(select 1 from pg_attribute where attrelid='public.ruby_submissions'::regclass and attname='source_link' and not attisdropped)
    or not exists(select 1 from pg_attribute where attrelid='public.ruby_card_revisions'::regclass and attname='source_link' and not attisdropped) then
  raise exception 'Kalshi pause requires the complete ruby_kalshi_source_link migration; review installed prerequisites';
 end if;
end $$;

create function private.guard_kalshi_submission_pause() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.source_link is not null then
  if tg_op='INSERT' then
   raise exception 'Kalshi is temporarily unavailable. Use typed legs or a screenshot instead.';
  elsif new.source_link is distinct from old.source_link then
   raise exception 'Kalshi source changes are temporarily unavailable.';
  end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_kalshi_submission_pause() from public,anon,authenticated;
create trigger kalshi_submission_pause before insert or update of source_link on public.ruby_submissions
 for each row execute function private.guard_kalshi_submission_pause();

create function private.guard_kalshi_revision_pause() returns trigger
language plpgsql security invoker set search_path='' as $$
declare current_source text; latest_source text;
begin
 -- Removing a link remains possible if the existing minimum-content check passes.
 if new.source_link is null then return new;end if;
 -- Use the same per-card lock as edit_ruby: compare with the CURRENT revision,
 -- not an old original link, and serialize competing edit operations.
 select source_link into current_source from public.ruby_submissions
  where id=new.submission_id for update;
 if not found then raise exception 'Card not found';end if;
 select source_link into latest_source from public.ruby_card_revisions
  where submission_id=new.submission_id order by revision desc limit 1;
 if found then current_source:=latest_source;end if;
 if new.source_link is distinct from current_source then
  raise exception 'Kalshi source changes are temporarily unavailable.';
 end if;
 return new;
end $$;
revoke all on function private.guard_kalshi_revision_pause() from public,anon,authenticated;
create trigger kalshi_revision_pause before insert on public.ruby_card_revisions
 for each row execute function private.guard_kalshi_revision_pause();
-- Exact pre-existing submit retries never INSERT and keep their original guard and
-- notification behavior. Legacy edit_ruby still carries the current link forward.
-- UPDATE/DELETE revision immutability and account-erasure exceptions are unchanged.
commit;
