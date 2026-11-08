-- Zone polls: run the poll question and every option through the same harmful-content and
-- guaranteed-return check that community posts and comments use (private.community_safety_check), so
-- poll text is not a way around it. Applies to every insert, including direct ones.
create or replace function private.guard_community_poll() returns trigger
language plpgsql set search_path='' as $$
declare o jsonb; seen text[] := '{}'; t text;
begin
 new.question := btrim(new.question);
 for o in select value from jsonb_array_elements(new.options) loop
  if jsonb_typeof(o) <> 'string' then raise exception 'Poll options must be text'; end if;
  t := btrim(o #>> '{}');
  if length(t) not between 1 and 60 then raise exception 'Poll options must be 1-60 characters'; end if;
  if lower(t) = any(seen) then raise exception 'Poll options must be different'; end if;
  seen := seen || lower(t);
 end loop;
 if (new.question || ' ' || array_to_string(seen, ' ')) ~*
  '(guaranteed (profit|returns|win)|risk[- ]free (bet|profit)|kill yourself|i will kill you|javascript:|<script)' then
  raise exception 'Remove harmful content, executable links or guaranteed-return claims';
 end if;
 new.options := (select jsonb_agg(btrim(value #>> '{}')) from jsonb_array_elements(new.options));
 return new;
end $$;
revoke all on function private.guard_community_poll() from public, anon, authenticated;
