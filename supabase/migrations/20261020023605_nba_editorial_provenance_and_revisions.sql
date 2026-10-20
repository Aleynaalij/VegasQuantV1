-- One original and one linear revision chain for each editorial selection.
create unique index nba_editorial_one_original on public.nba_editorial_picks(game_id,player,market) where supersedes_id is null;
create unique index nba_editorial_one_successor on public.nba_editorial_picks(supersedes_id) where supersedes_id is not null;

create function private.validate_nba_editorial_provenance() returns trigger
language plpgsql security invoker set search_path='' as $$
declare current_id uuid; s jsonb;
begin
 if jsonb_typeof(new.evidence->'source_files') is distinct from 'array'
    or jsonb_array_length(new.evidence->'source_files')<2
    or coalesce(new.evidence->>'generated_at','')=''
    or (new.evidence->>'generated_at')::timestamptz>now()
    or (new.evidence->>'historical_cutoff')::timestamptz>(new.evidence->>'generated_at')::timestamptz
    or new.evidence->>'quote_observation_id' is distinct from new.quote_observation_id::text then
  raise exception 'NBA_EDITORIAL_BLOCKED: complete timestamped source provenance required';
 end if;
 for s in select * from jsonb_array_elements(new.evidence->'source_files') loop
  if coalesce(s->>'url','') not like 'https://%'
     or coalesce(s->>'sha256','') !~ '^[a-f0-9]{64}$'
     or coalesce(s->>'retrieved_at','')=''
     or (s->>'retrieved_at')::timestamptz>now() then
   raise exception 'NBA_EDITORIAL_BLOCKED: source hash and retrieval time required';
  end if;
 end loop;
 if new.evidence->>'input_sha256' is distinct from
    encode(sha256(convert_to((new.evidence-'input_sha256'-'input_hash_format')::text,'UTF8')),'hex') then
  raise exception 'NBA_EDITORIAL_BLOCKED: evidence hash mismatch';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',new.game_id::text,new.player,new.market),0));
 select p.id into current_id from public.nba_editorial_picks p
 where p.game_id=new.game_id and p.player=new.player and p.market=new.market
 and not exists(select 1 from public.nba_editorial_picks successor where successor.supersedes_id=p.id);
 if new.supersedes_id is distinct from current_id then
  raise exception 'NBA_EDITORIAL_BLOCKED: revision must supersede the current publication';
 end if;
 return new;
end $$;
revoke all on function private.validate_nba_editorial_provenance() from public,anon,authenticated;
create trigger validate_nba_editorial_provenance before insert on public.nba_editorial_picks
 for each row execute function private.validate_nba_editorial_provenance();
