create function private.validate_nba_editorial_source_timeline() returns trigger
language plpgsql security invoker set search_path='' as $$
declare s jsonb;
begin
 for s in select * from jsonb_array_elements(new.evidence->'source_files') loop
  if (s->>'retrieved_at')::timestamptz>(new.evidence->>'generated_at')::timestamptz then
   raise exception 'NBA_EDITORIAL_BLOCKED: sources must be retrieved before evidence generation';
  end if;
 end loop;
 return new;
end $$;
revoke all on function private.validate_nba_editorial_source_timeline() from public,anon,authenticated;
create trigger validate_nba_editorial_source_timeline before insert on public.nba_editorial_picks
 for each row execute function private.validate_nba_editorial_source_timeline();
