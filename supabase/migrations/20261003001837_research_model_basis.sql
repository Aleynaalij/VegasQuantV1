-- Require evidence for newly published numeric research targets; old versions remain immutable.
create function private.require_research_model_basis() returns trigger language plpgsql set search_path='' as $$
declare t jsonb; begin
 for t in select value from jsonb_array_elements(coalesce(new.intelligence->'targets','[]')) loop
  if t->>'status' <> 'OFFICIAL' and ((t->>'model_probability') is not null or (t->>'edge') is not null or t->>'status'='BETTABLE') and length(coalesce(trim(t->>'model_basis'),''))<40 then
   raise exception 'Numeric research targets require documented model inputs, assumptions and source; otherwise WAIT/PASS with unknown estimates';
  end if;
  if t->>'status'='BETTABLE' and ((t->>'edge') is null or (t->>'edge')::numeric<3 or (t->>'model_probability') is null or (t->>'market_probability') is null) then
   raise exception 'BETTABLE requires supplied probabilities and at least 3 percentage points of edge';
  end if;
 end loop;
 return new;
end $$;
revoke all on function private.require_research_model_basis() from public;
create trigger require_research_model_basis before insert on public.analysis_versions for each row execute function private.require_research_model_basis();
