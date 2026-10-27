-- Prospective only: never rewrite or regrade historical publications.
create table private.nfl_selection_rule_versions (
 version text primary key, effective_at timestamptz not null default now(), rules jsonb not null,
 source text not null
);
alter table private.nfl_selection_rule_versions enable row level security;
insert into private.nfl_selection_rule_versions(version,rules,source) values
 ('2026-10-16.r1', '{"history_min":5,"history_margin":0.05,"edge_min":0.03,"preferred_min":-249,"preferred_max":-150,"pod_min":-300,"pod_max":-150,"halftime_max":3,"parlay_min":3,"parlay_max":4,"lead_limit":10,"rush_remaining_fraction":0.30,"adverse_cents":15,"quote_seconds":900,"live_seconds":120,"lock_hours":2}', 'research/lessons/README.md; research/lessons/2026-10-16.md');
create trigger immutable_nfl_rules before update or delete on private.nfl_selection_rule_versions for each row execute function private.immutable();
-- Empty by design: SHADOW_ONLY v0.3 is NOT approved. No caller-supplied validated=true bypass.
create table private.nfl_selection_model_approvals (
 model_id text primary key, markets text[] not null, validation_url text not null check(validation_url like 'https://%'),
 approved_at timestamptz not null default now()
);
alter table private.nfl_selection_model_approvals enable row level security;
create trigger immutable_nfl_models before update or delete on private.nfl_selection_model_approvals for each row execute function private.immutable();
create table private.nfl_selection_gate_decisions (
 id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
 version text not null references private.nfl_selection_rule_versions(version),
 entity text not null, entity_id uuid, accepted boolean not null, errors jsonb not null,
 evidence jsonb not null
);
alter table private.nfl_selection_gate_decisions enable row level security;
create trigger immutable_nfl_gate_decisions before update or delete on private.nfl_selection_gate_decisions for each row execute function private.immutable();
create table private.nfl_selection_identities (
 identity text primary key, entity text not null, entity_id uuid not null,
 created_at timestamptz not null default now()
);
alter table private.nfl_selection_identities enable row level security;
create trigger immutable_nfl_identities before update or delete on private.nfl_selection_identities for each row execute function private.immutable();
revoke all on private.nfl_selection_rule_versions,private.nfl_selection_model_approvals,private.nfl_selection_gate_decisions,private.nfl_selection_identities from public,anon,authenticated,service_role;

create function private.nfl_gate_number(v jsonb) returns numeric language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(v) <> 'number' or v is null or v::text !~ '^-?[0-9]+(\.[0-9]+)?$' then return null; end if;
 return v::text::numeric;
end $$;
create function private.nfl_gate_time(v text) returns timestamptz language plpgsql stable set search_path='' as $$
begin
 if v is null or v !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then return null; end if;
 return v::timestamptz;
exception when others then return null;
end $$;
-- Punctuation, case and spacing do not create a new selection. Market/line remain part of key.
create function private.nfl_gate_identity(game uuid, player text, market text) returns text language plpgsql immutable set search_path='' as $$
declare stat text; dir text; amount numeric; cleaned text:=lower(coalesce(market,'')); name text:=lower(coalesce(player,''));
begin
 -- Legacy official names may contain the whole target instead of a separate player field.
 if cleaned in ('player prop','') then cleaned:=name; name:=regexp_replace(name,'[[:space:]]+(over[[:space:]]+|under[[:space:]]+)?[0-9].*$',''); end if;
 stat:=case when cleaned like '%rushing%' then 'rushing_yards' when cleaned like '%receiving%' then 'receiving_yards' when cleaned like '%passing%' then 'passing_yards' when cleaned like '%reception%' or cleaned like '%catch%' then 'receptions' end;
 amount:=substring(cleaned from '([0-9]+(?:\.[0-9]+)?)')::numeric;
 dir:=case when cleaned like '%under%' then 'under' else 'over' end;
 if stat is not null and amount is not null then
  if dir='under' then amount:=ceil(amount)-1;
  elsif cleaned like '%+%' then amount:=ceil(amount);
  else amount:=floor(amount)+1; end if;
  return game::text||':'||regexp_replace(name,'[^a-z0-9]','','g')||':'||stat||':'||dir||':'||trim_scale(amount)::text;
 end if;
 return game::text||':'||regexp_replace(name||' '||cleaned,'[^a-z0-9]','','g');
end $$;
-- Seed from immutable original publications so existing picks cannot be republished as new.
insert into private.nfl_selection_identities(identity,entity,entity_id)
 select distinct on (private.nfl_gate_identity(l.game_id,l.name,l.market))
 private.nfl_gate_identity(l.game_id,l.name,l.market), 'legacy',coalesce(l.release_id,l.official_pick_id)
 from public.published_legs l join public.games g on g.id=l.game_id
 where upper(g.sport)='NFL' and l.kind <> 'PARLAY'
 order by private.nfl_gate_identity(l.game_id,l.name,l.market),l.published_at
 on conflict do nothing;

create function private.nfl_selection_errors(c jsonb, rules jsonb, as_of timestamptz default now()) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 e jsonb:='[]'; s jsonb:=c->'selection_gate'; g public.games; q public.source_observations; initial_q public.source_observations;
 odds numeric:=private.nfl_gate_number(c->'odds'); threshold numeric; be numeric; clear_rate numeric;
 sample jsonb; x jsonb; total integer:=0; hits integer:=0; ids text[]:='{}'; vals numeric[]:='{}'; median_value numeric;
 value numeric; t timestamptz; qt timestamptz; observed timestamptz; cutoff timestamptz;
 phase text; stat text; dir text; position text; point numeric; provider_market text; provider_direction text;
 first_odds numeric; p numeric; baseline jsonb; matching jsonb; m text; required text;
begin
 if jsonb_typeof(s) is distinct from 'object' then return jsonb_build_array('R1-R8: selection_gate evidence object required'); end if;
 if coalesce(s->>'version','') <> '2026-10-16.r1' then e:=e||'"R1-R8: unsupported evidence version"'::jsonb; end if;
 begin select * into g from public.games where id=(c->>'game_id')::uuid;
 exception when invalid_text_representation then null; end;
 if g.id is null or upper(g.sport)<>'NFL' or g.kickoff_tbd then return e||'"R8: exact NFL game and confirmed kickoff required"'::jsonb; end if;
 phase:=s->>'phase'; stat:=s->>'stat'; dir:=s->>'direction'; position:=s->>'position';
 threshold:=trim_scale(private.nfl_gate_number(s->'threshold'));
 if phase is null or phase not in ('pregame','halftime') then e:=e||'"R4: phase must be pregame or halftime"'::jsonb; end if;
 if stat is null or stat not in ('rushing_yards','receiving_yards','receptions','passing_yards') or dir is null or dir not in ('at_least','over','under') or threshold is null or threshold<0 then
  return e||'"R8: supported structured player stat, direction and threshold required"'::jsonb;
 end if;
 if dir='at_least' and trunc(threshold)<>threshold then e:=e||'"R8: at-least stat targets require whole numbers"'::jsonb; end if;
 if coalesce(trim(c->>'name'),'')='' or position is null or position not in ('QB','RB','WR','TE') or coalesce(s->>'team','') not in (g.home_abbreviation,g.away_abbreviation) then
  e:=e||'"R8: named player, position and team required"'::jsonb;
 end if;
 -- Require an exact rendering of the structured selection so evidence cannot describe another line.
 m:=case stat when 'rushing_yards' then 'rushing yards' when 'receiving_yards' then 'receiving yards' when 'passing_yards' then 'passing yards' else 'receptions' end;
 required:=case dir when 'at_least' then threshold::text||'+ '||m when 'over' then 'Over '||threshold::text||' '||m else 'Under '||threshold::text||' '||m end;
 if coalesce(c->>'market','') <> 'Full game · '||required or coalesce(c->>'copy_text','') <> (c->>'name')||' '||required then
  e:=e||'"R8: display market and Gambly copy must exactly match structured target"'::jsonb;
 end if;
 if odds is null or abs(odds)<100 or abs(odds)>100000 or trunc(odds)<>odds or coalesce(c->>'book','')<>'FanDuel' then
  e:=e||'"R8: exact numeric FanDuel American price required"'::jsonb;
 else be:=case when odds<0 then abs(odds)/(abs(odds)+100) else 100/(odds+100) end; end if;
 -- Historical screening is never substituted for model probability.
 sample:=s->'history';
 if jsonb_typeof(sample) is distinct from 'array' then e:=e||'"R1: sourced last-5+ game history required"'::jsonb;
 else
  for x in select * from jsonb_array_elements(sample) loop
   value:=private.nfl_gate_number(x->'value'); t:=private.nfl_gate_time(x->>'played_at');
   if value is null or t is null or t>=g.kickoff or t>=as_of or coalesce(x->>'source_url','') !~ '^https://' or coalesce(x->>'game_id','')='' or (x->>'game_id')=any(ids) then
    e:=e||'"R1: historical games must be unique, sourced and before publication/kickoff"'::jsonb;
   else
    ids:=array_append(ids,x->>'game_id'); vals:=array_append(vals,value); total:=total+1;
    if (dir='at_least' and value>=threshold) or (dir='over' and value>threshold) or (dir='under' and value<threshold) then hits:=hits+1; end if;
   end if;
  end loop;
  if total<(rules->>'history_min')::integer or s->>'history_window' is distinct from 'latest_consecutive_games' or coalesce(s->>'history_source_url','') !~ '^https://' then e:=e||'"R1: at least five latest consecutive games and history provenance required"'::jsonb; end if;
  if total>0 then
   clear_rate:=hits::numeric/total;
   select percentile_cont(0.5) within group(order by z) into median_value from unnest(vals) z;
   if be is null or clear_rate < be+(rules->>'history_margin')::numeric then e:=e||'"R1: last-5+ clear rate below break-even plus five points"'::jsonb; end if;
  end if;
 end if;
 -- Model registry must contain independently approved validation, not SHADOW_ONLY.
 p:=private.nfl_gate_number(s->'model_probability'); cutoff:=private.nfl_gate_time(s->>'historical_cutoff');
 if not exists(select 1 from private.nfl_selection_model_approvals a where a.model_id=s->>'model_id' and stat=any(a.markets) and a.approved_at<=as_of)
  or p is null or p<0 or p>1 or cutoff is null or cutoff>=g.kickoff or cutoff>as_of
  or coalesce(s->>'forecast_source_url','') !~ '^https://' or jsonb_typeof(s->'input_hashes') is distinct from 'object' or s->'input_hashes'='{}'::jsonb
  or private.nfl_gate_time(s->>'generated_at') is null or private.nfl_gate_time(s->>'generated_at')>as_of
  or private.nfl_gate_time(s->>'generated_at')<as_of-interval '15 minutes'
 then e:=e||'"BIBLE/R2: approved priced model evidence required; SHADOW_ONLY and historical clear rates cannot establish edge"'::jsonb;
 elsif be is null or p-be<(rules->>'edge_min')::numeric then e:=e||'"BIBLE/R2: model edge below three percentage points"'::jsonb; end if;
 if (dir='under' or median_value is null or threshold>=median_value) and odds between (rules->>'preferred_min')::numeric and (rules->>'preferred_max')::numeric then
  e:=e||'"R2: preferred alternate over target must be below historical median"'::jsonb;
 end if;
 if c->>'pick_of_day'='true' and (odds is null or odds not between (rules->>'pod_min')::numeric and (rules->>'pod_max')::numeric) then e:=e||'"R3: Pick of the Day must be -150 through -300"'::jsonb; end if;
 if odds<=-500 and coalesce(c->>'parlay_group','')='' then e:=e||'"R3: -500 or shorter is an anchor only, never a standalone selection"'::jsonb; end if;
 if position='TE' and stat<>'receptions' then e:=e||'"R5: tight ends require receptions or skip"'::jsonb; end if;
 if phase='pregame' and (as_of>=g.kickoff or as_of<g.kickoff-make_interval(hours=>(rules->>'lock_hours')::integer)) then e:=e||'"R7: publish only after a fresh lock review within two hours before kickoff; earlier cards remain drafts"'::jsonb; end if;
 if phase='halftime' then
  if as_of<g.kickoff or odds is null or odds not between (rules->>'preferred_min')::numeric and (rules->>'preferred_max')::numeric or dir='under' then e:=e||'"R4: halftime requires overs at -150 through -249 after kickoff"'::jsonb; end if;
  if coalesce(s->>'live_status','')<>'STATUS_HALFTIME' or private.nfl_gate_time(s->>'live_observed_at') is null or private.nfl_gate_time(s->>'live_observed_at')<as_of-make_interval(secs=>(rules->>'live_seconds')::integer) or private.nfl_gate_time(s->>'live_observed_at')>as_of or coalesce(s->>'live_source_url','') !~ '^https://' then e:=e||'"R4: fresh sourced halftime status required"'::jsonb; end if;
  value:=private.nfl_gate_number(s->'team_lead');
  if value is null or (stat in ('receiving_yards','receptions') and value >= (rules->>'lead_limit')::numeric) then e:=e||'"R4: no receiving overs for teams leading by ten or more; score evidence required"'::jsonb; end if;
  value:=private.nfl_gate_number(s->'first_half_yards');
  if stat='rushing_yards' and (value is null or value<=0 or greatest(threshold-value,0)>value*(rules->>'rush_remaining_fraction')::numeric) then e:=e||'"R4: rushing target needs over thirty percent of first-half yards, or first-half evidence is missing"'::jsonb; end if;
 end if;
 foreach required in array array['opportunity_case','failure_path','role_source_url','availability_source_url','game_script_review'] loop
  if coalesce(trim(s->>required),'')='' then e:=e||jsonb_build_array('REVIEW: missing '||required); end if;
 end loop;
 if s->>'availability_verified' is distinct from 'true' then e:=e||'"REVIEW: explicit availability verification required"'::jsonb; end if;
 -- Link to immutable collector observation and match exact player/line/direction/price.
 begin select * into q from public.source_observations where id=(s->>'quote_observation_id')::uuid; exception when invalid_text_representation then null; end;
 provider_market:=case stat when 'rushing_yards' then 'player_rush_yds' when 'receiving_yards' then 'player_reception_yds' when 'passing_yards' then 'player_pass_yds' else 'player_receptions' end;
 provider_direction:=case dir when 'under' then 'Under' else 'Over' end;
 point:=case dir when 'at_least' then threshold-0.5 else threshold end;
 qt:=private.nfl_gate_time(q.payload->>'provider_updated_at'); observed:=private.nfl_gate_time(c->>'quote_observed_at');
 if q.id is null or q.game_id is distinct from g.id or q.kind<>'odds' or q.payload->>'book' is distinct from 'FanDuel'
  or q.payload->>'market' not in (provider_market,provider_market||'_alternate') or qt is null or qt>as_of or qt<as_of-make_interval(secs=>case when phase='halftime' then (rules->>'live_seconds')::integer else (rules->>'quote_seconds')::integer end)
  or observed is distinct from qt or q.recorded_at>as_of or coalesce(c->>'quote_source_url','')!~'^https://' or c->>'quote_source_url' is distinct from q.source then
  e:=e||'"R8: fresh immutable exact-market FanDuel observation and quote provenance required"'::jsonb;
 else
  select o into matching from jsonb_array_elements(q.payload->'outcomes') o where o->>'description'=c->>'name' and o->>'name'=provider_direction and private.nfl_gate_number(o->'point')=point and private.nfl_gate_number(o->'price')=odds limit 1;
  if matching is null then e:=e||'"R8: quote does not match exact player, market, direction, line and price"'::jsonb; end if;
  if exists(select 1 from public.source_observations newer where newer.game_id=g.id and newer.kind='odds' and newer.payload->>'book'='FanDuel' and newer.payload->>'market'=q.payload->>'market' and newer.observed_at>q.observed_at and newer.recorded_at<=as_of) then e:=e||'"R7: a newer market snapshot exists; refresh the selection"'::jsonb; end if;
 end if;
 begin select * into initial_q from public.source_observations where id=(s->>'initial_quote_observation_id')::uuid; exception when invalid_text_representation then null; end;
 if initial_q.id is null or initial_q.game_id is distinct from g.id or initial_q.payload->>'book' is distinct from 'FanDuel' or initial_q.payload->>'market' is distinct from q.payload->>'market' or initial_q.observed_at>q.observed_at then e:=e||'"R7: matching initial price observation required"'::jsonb;
 else
  select o into baseline from jsonb_array_elements(initial_q.payload->'outcomes') o where o->>'description'=c->>'name' and o->>'name'=provider_direction and private.nfl_gate_number(o->'point')=point limit 1;
  if exists(select 1 from public.source_observations earlier cross join lateral jsonb_array_elements(earlier.payload->'outcomes') o
   where earlier.game_id=g.id and earlier.kind='odds' and earlier.payload->>'book'='FanDuel' and earlier.payload->>'market'=q.payload->>'market'
   and earlier.observed_at<initial_q.observed_at and o->>'description'=c->>'name' and o->>'name'=provider_direction and private.nfl_gate_number(o->'point')=point) then
   e:=e||'"R7: initial observation must be earliest stored exact selection price"'::jsonb;
  end if;
  first_odds:=private.nfl_gate_number(baseline->'price');
  if first_odds is null or (odds-first_odds >= (rules->>'adverse_cents')::numeric) then e:=e||'"R7: initial price missing or market moved fifteen cents or more against selection"'::jsonb; end if;
 end if;
 return e;
end $$;

create function private.enforce_nfl_selection_gate() returns trigger language plpgsql security definer set search_path='' as $$
<<gate>>
declare
 rules record; c jsonb; leaf jsonb; evidence jsonb; errors jsonb:='[]'; errs jsonb; all_candidates jsonb;
 game uuid; sport text; idx integer:=0; cnt integer:=0; halftime_cnt integer:=0; pod_cnt integer:=0; keys text[]:='{}'; identity text;
 bundle jsonb; bundle_count integer:=0; key text; chosen jsonb; selections jsonb:='[]';
begin
 select * into rules from private.nfl_selection_rule_versions where effective_at<=now() order by effective_at desc,version desc limit 1;
 if tg_table_name='official_picks' then
  select upper(g.sport) into sport from public.games g where g.id=new.game_id;
  if sport<>'NFL' then return new; end if;
  select a.sections->'selection_gate' into evidence from public.analysis_versions a where a.id=new.analysis_id;
  c:=jsonb_build_object('game_id',new.game_id,'name',evidence->>'player_name','market',evidence->>'market','copy_text',evidence->>'copy_text','odds',new.odds,'book',new.book,'quote_observed_at',evidence->>'quote_observed_at','quote_source_url',evidence->>'quote_source_url','selection_gate',evidence);
  if new.selection is distinct from evidence->>'copy_text' or new.market<>'Player Prop'
   or new.recommended_line is distinct from private.nfl_gate_number(evidence->'threshold')
   or new.direction is distinct from (case when evidence->>'direction'='under' then 'under' else 'over' end)
   or new.model_probability is distinct from private.nfl_gate_number(evidence->'model_probability')*100 then
   raise exception using errcode='23514',message='NFL_SELECTION_GATE_BLOCKED',detail='Official selection, line, direction and probability must match reviewed analysis selection_gate';
  end if;
  all_candidates:=jsonb_build_array(c);
 else
  all_candidates:=new.candidates;
 end if;
 for c in select * from jsonb_array_elements(all_candidates) loop
  idx:=idx+1;
  if c->>'parlay'='true' then bundle:=c; bundle_count:=bundle_count+1; continue; end if;
  begin game:=(c->>'game_id')::uuid; exception when invalid_text_representation then game:=null; end;
  if game is null and tg_table_name='candidate_releases' then select s.game_id into game from public.challenge_stages s where s.id=new.stage_id; c:=c||jsonb_build_object('game_id',game); end if;
  select upper(g.sport) into sport from public.games g where g.id=game;
  if sport is null then errors:=errors||jsonb_build_array('R8: candidate '||idx||' has no resolvable game'); continue; end if;
  if sport<>'NFL' then continue; end if;
  cnt:=cnt+1;
  if c#>>'{selection_gate,phase}'='halftime' then halftime_cnt:=halftime_cnt+1; end if;
  if c->>'pick_of_day'='true' then pod_cnt:=pod_cnt+1; end if;
  errs:=private.nfl_selection_errors(c,rules.rules,now());
  if jsonb_array_length(errs)>0 then errors:=errors||jsonb_build_object('candidate',idx,'errors',errs); end if;
  identity:=private.nfl_gate_identity(game,c->>'name',c->>'market');
  if identity=any(keys) or exists(select 1 from private.nfl_selection_identities i where i.identity=gate.identity) then errors:=errors||jsonb_build_array('R8: duplicate selection at candidate '||idx); end if;
  keys:=array_append(keys,identity); selections:=selections||jsonb_build_array(c);
 end loop;
 if cnt=0 and bundle_count>0 then raise exception using message='NFL_SELECTION_GATE_BLOCKED',detail='Bundles require structured leaf selections; no bundle-only bypass'; end if;
 if halftime_cnt>(rules.rules->>'halftime_max')::integer or (halftime_cnt>0 and halftime_cnt<>cnt) then errors:=errors||'"R4: at most three halftime legs and no mixed pregame/halftime card"'::jsonb; end if;
 if pod_cnt>1 then errors:=errors||'"R3: only one Pick of the Day per release"'::jsonb; end if;
 if cnt>0 and bundle_count>0 then
  if bundle_count<>1 or cnt<>jsonb_array_length(all_candidates)-bundle_count or cnt not between (rules.rules->>'parlay_min')::integer and least((rules.rules->>'parlay_max')::integer,case when halftime_cnt>0 then (rules.rules->>'halftime_max')::integer else 4 end)
   or jsonb_typeof(bundle->'leg_keys') is distinct from 'array' or jsonb_typeof(bundle->'parlay_legs') is distinct from 'array' then errors:=errors||'"R6: one parlay with three to four qualifying leaves (halftime maximum three) required"'::jsonb;
  elsif jsonb_array_length(bundle->'leg_keys')<>cnt or jsonb_array_length(bundle->'parlay_legs')<>cnt then errors:=errors||'"R6: bundle and leaf counts differ"'::jsonb;
  else
   idx:=0;
   for leaf in select * from jsonb_array_elements(all_candidates) loop
    idx:=idx+1; if leaf->>'parlay'='true' then continue; end if;
    key:='candidate:'||new.id::text||':'||idx;
    if not (bundle->'leg_keys' ? key) or leaf->>'parlay_group' is distinct from new.id::text then errors:=errors||'"R6: bundle must reference exact leaves in this release"'::jsonb; end if;
    select x into chosen from jsonb_array_elements(bundle->'parlay_legs') x where x->>'name'=leaf->>'name' and x->>'market'=leaf->>'market' limit 1;
    if chosen is null then errors:=errors||'"R6: displayed parlay legs differ from validated leaves"'::jsonb; end if;
   end loop;
  end if;
  if coalesce(trim(bundle->>'correlation_review'),'')='' or coalesce(trim(bundle->>'failure_scenarios'),'')='' then errors:=errors||'"R6: correlation review and shared failure scenarios required"'::jsonb; end if;
  if bundle->>'pick_of_day'='true' then errors:=errors||'"R3: Pick of the Day must be a single selection"'::jsonb; end if;
 elsif cnt>0 and exists(select 1 from jsonb_array_elements(selections) x where coalesce(x->>'parlay_group','')<>'') then errors:=errors||'"R6: anchor/group requires a validated bundle in the same release"'::jsonb;
 end if;
 if jsonb_array_length(errors)>0 then raise exception using errcode='23514', message='NFL_SELECTION_GATE_BLOCKED',detail=jsonb_build_object('version',rules.version,'errors',errors)::text,hint='Read research/lessons/README.md and docs/product/nfl-selection-gate.md; withhold failed legs.'; end if;
 if cnt>0 then
  -- Unique identities close concurrent publication races, even for privileged direct inserts.
  foreach identity in array keys loop
   insert into private.nfl_selection_identities(identity,entity,entity_id) values(identity,tg_table_name,new.id);
  end loop;
  insert into private.nfl_selection_gate_decisions(version,entity,entity_id,accepted,errors,evidence) values(rules.version,tg_table_name,new.id,true,'[]',all_candidates);
 end if;
 return new;
end $$;
revoke all on function private.nfl_gate_number(jsonb),private.nfl_gate_time(text),private.nfl_gate_identity(uuid,text,text),private.nfl_selection_errors(jsonb,jsonb,timestamptz),private.enforce_nfl_selection_gate() from public,anon,authenticated,service_role;
create trigger enforce_nfl_selection_gate before insert on public.candidate_releases for each row execute function private.enforce_nfl_selection_gate();
create trigger enforce_nfl_selection_gate before insert on public.official_picks for each row execute function private.enforce_nfl_selection_gate();
-- Research feed is for news/status; selections use gated candidate releases, not prose bypasses.
create function private.guard_nfl_feed_decision() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.category='Decision' and (new.game_id is null or exists(select 1 from public.games g where g.id=new.game_id and upper(g.sport)='NFL')) and not exists(select 1 from public.research_leg_results r where r.leg_key=new.result_leg_key) then
  raise exception using errcode='23514',message='NFL_SELECTION_GATE_BLOCKED',detail='New NFL Decision cards must use gated candidate_releases. Use Watchlist/Injury watch/Market update for research; result-linked updates remain allowed.';
 end if;
 return new;
end $$;
revoke all on function private.guard_nfl_feed_decision() from public,anon,authenticated,service_role;
create trigger guard_nfl_feed_decision before insert on public.research_feed_posts for each row execute function private.guard_nfl_feed_decision();
-- Trusted callers can preflight without creating a public card; rejected evidence is durably journaled.
create function public.preflight_nfl_selection(c jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
<<preflight>>
declare r record; e jsonb; identity text; id uuid;
begin
 if coalesce(auth.role(),'')<>'service_role' and not private.is_admin() then raise exception 'Admin access required'; end if;
 select * into r from private.nfl_selection_rule_versions where effective_at<=now() order by effective_at desc,version desc limit 1;
 e:=private.nfl_selection_errors(c,r.rules,now());
 begin identity:=private.nfl_gate_identity((c->>'game_id')::uuid,c->>'name',c->>'market'); exception when invalid_text_representation then identity:=null; end;
 if exists(select 1 from private.nfl_selection_identities i where i.identity=preflight.identity) then e:=e||'"R8: duplicate selection"'::jsonb; end if;
 insert into private.nfl_selection_gate_decisions(version,entity,accepted,errors,evidence) values(r.version,'preflight',jsonb_array_length(e)=0,e,c) returning nfl_selection_gate_decisions.id into id;
 return jsonb_build_object('decision_id',id,'version',r.version,'passed',jsonb_array_length(e)=0,'errors',e,'publication_authorized',false);
end $$;
revoke all on function public.preflight_nfl_selection(jsonb) from public,anon;
grant execute on function public.preflight_nfl_selection(jsonb) to authenticated,service_role;

-- Old edge-release extras must not bypass review through target_legs.
create function private.guard_nfl_edge_release() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.official_picks; item jsonb;
begin
 select * into p from public.official_picks where id=new.official_pick_id;
 if not exists(select 1 from public.games g where g.id=p.game_id and upper(g.sport)='NFL') then return new; end if;
 item:=new.items->0;
 if jsonb_array_length(new.items)<>1 or item->>'selection' is distinct from p.selection
  or private.nfl_gate_number(item->'odds') is distinct from p.odds
  or not exists(select 1 from private.nfl_selection_gate_decisions d where d.entity='official_picks' and d.entity_id=p.id and d.accepted) then
  raise exception using errcode='23514',message='NFL_SELECTION_GATE_BLOCKED',detail='Edge releases require the gated official selection only; unreviewed target-leg extras are prohibited';
 end if;
 return new;
end $$;
revoke all on function private.guard_nfl_edge_release() from public,anon,authenticated,service_role;
create trigger guard_nfl_edge_release before insert on public.edge_releases for each row execute function private.guard_nfl_edge_release();
