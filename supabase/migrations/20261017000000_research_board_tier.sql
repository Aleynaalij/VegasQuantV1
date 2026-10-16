-- Research board tier. The NFL selection gate stays the only way to publish a pick, and it blocks
-- every NFL pick until a priced model is approved. Research legs are a separate, labeled tier that
-- an automated job publishes through the week from collected data: each leg must quote an exact,
-- recent FanDuel price from a stored observation, pass the recent-form rule (R1), sit in the
-- -150..-299 band (R2/R3) and never repeat a selection. They are kind RESEARCH, are graded and
-- price-tracked like any published leg, and are excluded from the official records.

-- A release is a research board only when every candidate is a plain research leg.
create function private.is_research_release(c jsonb) returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(c)='array' and jsonb_array_length(c)>0 and not exists(
  select 1 from jsonb_array_elements(c) x
  where jsonb_typeof(x)<>'object' or x->>'research' is distinct from 'true'
   or x->>'analysis_kind' is distinct from 'RESEARCH_BOARD'
   or coalesce(x->>'parlay','false')<>'false' or coalesce(x->>'pick_of_day','false')<>'false'
   or coalesce(x->>'fun_play','false')<>'false' or x ? 'legs' or x ? 'parlay_group'
   or x ? 'supersedes_release_id' or x ? 'selection_gate');
$$;

-- Research selections already published, so a board never repeats one.
create table private.research_identities(
 identity text primary key, release_id uuid not null, created_at timestamptz not null default now()
);
alter table private.research_identities enable row level security;
create trigger immutable_research_identities before update or delete on private.research_identities for each row execute function private.immutable();
revoke all on private.research_identities from public, anon, authenticated, service_role;

create function private.enforce_research_board() returns trigger language plpgsql security definer set search_path='' as $$
declare
 c jsonb; idx integer:=0; errors jsonb:='[]'; g public.games; odds numeric; threshold numeric; base text;
 quoted timestamptz; ev jsonb; cleared numeric; sample numeric; be numeric; sel text; keys text[]:='{}';
 m text[]; rule_version text;
begin
 for c in select * from jsonb_array_elements(new.candidates) loop
  idx:=idx+1;
  g:=null;
  if coalesce(c->>'game_id','') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
   select * into g from public.games where id=(c->>'game_id')::uuid;
  end if;
  if g.id is null or upper(g.sport)<>'NFL' or g.kickoff_tbd or g.kickoff<=now() then
   errors:=errors||jsonb_build_array(idx||': upcoming NFL game required'); continue;
  end if;
  if new.expires_at>g.kickoff then errors:=errors||jsonb_build_array(idx||': board must expire by kickoff'); end if;
  m:=regexp_match(coalesce(c->>'market',''),'^Full game · ([0-9]{1,3})\+ (rushing yards|receiving yards|passing yards|receptions)$');
  if m is null or coalesce(trim(c->>'name'),'')='' then errors:=errors||jsonb_build_array(idx||': full-game N+ player stat required'); continue; end if;
  threshold:=m[1]::numeric;
  base:=case m[2] when 'rushing yards' then 'player_rush_yds' when 'receiving yards' then 'player_reception_yds'
   when 'passing yards' then 'player_pass_yds' else 'player_receptions' end;
  odds:=private.nfl_gate_number(c->'odds');
  if c->>'book' is distinct from 'FanDuel' or odds is null or odds>-150 or odds<=-300 then
   errors:=errors||jsonb_build_array(idx||': FanDuel price from -150 to -299 required'); continue;
  end if;
  quoted:=private.nfl_gate_time(c->>'quote_observed_at');
  -- The exact price must come from a stored FanDuel observation of this line, at most eight hours old.
  if quoted is null or quoted<now()-interval '8 hours' or not exists(
   select 1 from public.source_observations o cross join lateral jsonb_array_elements(o.payload->'outcomes') x
   where o.game_id=g.id and o.kind='odds' and o.payload->>'book'='FanDuel'
    and o.payload->>'market' in (base, base||'_alternate') and o.observed_at=quoted
    and x->>'name'='Over' and x->>'description'=c->>'name'
    and private.nfl_gate_number(x->'point')=threshold-0.5 and private.nfl_gate_number(x->'price')=odds) then
   errors:=errors||jsonb_build_array(idx||': exact recent FanDuel observation required'); continue;
  end if;
  -- R1: five or more recent games, clear rate at least five points above the price's break-even.
  ev:=c->'research_evidence';
  cleared:=private.nfl_gate_number(ev->'cleared'); sample:=private.nfl_gate_number(ev->'sample');
  be:=-odds/(-odds+100)*100;
  if cleared is null or sample is null or sample<5 or cleared<0 or cleared>sample or cleared/sample*100<be+5 then
   errors:=errors||jsonb_build_array(idx||': recent form must beat break-even by five points'); continue;
  end if;
  if coalesce(trim(c->>'why'),'')='' or coalesce(trim(c->>'risk'),'')='' or jsonb_typeof(c->'sources') is distinct from 'array' then
   errors:=errors||jsonb_build_array(idx||': why, risk and sources required'); continue;
  end if;
  sel:=private.nfl_gate_identity(g.id,c->>'name',c->>'market');
  if sel=any(keys) or exists(select 1 from private.research_identities r where r.identity=sel)
   or exists(select 1 from private.nfl_selection_identities i where i.identity=sel) then
   errors:=errors||jsonb_build_array(idx||': selection already published');
  end if;
  keys:=array_append(keys,sel);
 end loop;
 if jsonb_array_length(errors)>0 then
  raise exception using errcode='23514', message='RESEARCH_BOARD_BLOCKED', detail=errors::text;
 end if;
 foreach sel in array keys loop
  insert into private.research_identities(identity,release_id) values(sel,new.id);
 end loop;
 select r.version into rule_version from private.nfl_selection_rule_versions r where r.effective_at<=now() order by r.effective_at desc, r.version desc limit 1;
 insert into private.nfl_selection_gate_decisions(version,entity,entity_id,accepted,errors,evidence)
  values(rule_version,'research_board',new.id,true,'[]',new.candidates);
 return new;
end $$;
revoke all on function private.is_research_release(jsonb), private.enforce_research_board() from public, anon, authenticated, service_role;

-- Research boards take the research validator; every other release still takes the full gate.
drop trigger enforce_nfl_selection_gate on public.candidate_releases;
create trigger enforce_nfl_selection_gate before insert on public.candidate_releases for each row
 when (not private.is_research_release(new.candidates)) execute function private.enforce_nfl_selection_gate();
create trigger enforce_research_board before insert on public.candidate_releases for each row
 when (private.is_research_release(new.candidates)) execute function private.enforce_research_board();
grant insert on public.candidate_releases to service_role;

-- Research legs get their own kind, so official records (SINGLE, PICK_OF_DAY) never include them.
do $$declare v text;begin
 select pg_get_viewdef('public.published_legs'::regclass,true) into v;
 v:=replace(v,'WHEN (c.value ->> ''parlay''::text) = ''true''::text THEN ''PARLAY''::text',
  'WHEN (c.value ->> ''research''::text) = ''true''::text THEN ''RESEARCH''::text WHEN (c.value ->> ''parlay''::text) = ''true''::text THEN ''PARLAY''::text');
 if position('''RESEARCH''' in v)=0 then raise exception 'View pattern changed'; end if;
 execute 'create or replace view public.published_legs with(security_invoker=true)as '||v;
end $$;
