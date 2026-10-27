create function private.validate_nba_editorial_quote_timeline() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if (new.evidence->>'generated_at')::timestamptz < greatest(new.quote_recorded_at,new.quote_observed_at) then
  raise exception 'NBA_EDITORIAL_BLOCKED: evidence must follow quote observation and receipt';
 end if;
 return new;
end $$;
revoke all on function private.validate_nba_editorial_quote_timeline() from public,anon,authenticated;
create trigger validate_nba_editorial_quote_timeline before insert on public.nba_editorial_picks
 for each row execute function private.validate_nba_editorial_quote_timeline();
