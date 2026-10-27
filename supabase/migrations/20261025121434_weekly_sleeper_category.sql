-- Owner-authorized category exception, October 25: unpriced entertainment, never model-approved.
create function private.is_weekly_sleeper(c jsonb) returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(c)='array' and c#>>'{0,analysis_kind}'='ENTERTAINMENT_SLEEPER_PARLAY'
 and c#>>'{0,worth_a_dollar}'='true' and c#>>'{0,parlay}'='true'
$$;
revoke all on function private.is_weekly_sleeper(jsonb) from public,anon,authenticated;
grant execute on function private.is_weekly_sleeper(jsonb) to service_role;
create table private.weekly_sleeper_reviews(
 release_id uuid primary key references public.candidate_releases(id),
 policy_version text not null default '2026-10-25.sleeper',
 evidence jsonb not null,created_at timestamptz not null default now()
);
alter table private.weekly_sleeper_reviews enable row level security;
revoke all on private.weekly_sleeper_reviews from public,anon,authenticated,service_role;
create trigger immutable_sleeper_review before update or delete on private.weekly_sleeper_reviews for each row execute function private.immutable();

create function private.enforce_weekly_sleeper() returns trigger language plpgsql security definer set search_path='' as $$
declare
 bundle jsonb:=new.candidates->0; c jsonb; ev jsonb; x jsonb; q public.source_observations;
 g public.games; earliest timestamptz; latest timestamptz; cutoff timestamptz; generated timestamptz;
 ids uuid[]:='{}'; history_ids text[]; keys jsonb:='[]'; shown jsonb:='[]'; copies text[]:='{}';
 i integer:=0; sample integer; m text[]; source_url text; source_id text; required text; season integer; week integer;
begin
 if jsonb_array_length(new.candidates) not between 3 and 13 then raise exception 'SLEEPER_BLOCKED: two to twelve distinct-game leaves required';end if;
 if new.publication_key !~ '^worth-a-dollar-[0-9]{4}-week[0-9]{1,2}-v[0-9]+$' then raise exception 'SLEEPER_BLOCKED: weekly publication key required';end if;
 foreach required in array array['why','risk','correlation_review','failure_scenarios'] loop
  if length(btrim(coalesce(bundle->>required,'')))=0 then raise exception 'SLEEPER_BLOCKED: missing bundle %',required;end if;
 end loop;
 for c in select value from jsonb_array_elements(new.candidates) loop
  i:=i+1;
  if jsonb_typeof(c) is distinct from 'object' or c->>'pick_of_day' is distinct from 'false' or c->>'fun_play' is distinct from 'false'
   or coalesce(c->>'research','false')<>'false' then raise exception 'SLEEPER_BLOCKED: no POD, Hail Mary or research-board mixing';end if;
  foreach required in array array['odds','price','payout','combined_odds','combined_price','edge','ev','confidence','model_probability','model_id','selection_gate','book'] loop
   if c ? required and c->required<>'null'::jsonb then raise exception 'SLEEPER_BLOCKED: unpriced entertainment cannot claim %',required;end if;
  end loop;
  if coalesce(c->>'gambly_url','') not in ('https://gambly.com','https://gambly.com/') then raise exception 'SLEEPER_BLOCKED: supported Gambly link required';end if;
  if i=1 then continue;end if;
  if c->>'analysis_kind' is distinct from 'ENTERTAINMENT_SLEEPER' or coalesce(c->>'parlay','false')<>'false'
   or coalesce(c->>'worth_a_dollar','false')<>'false' or c->>'parlay_group' is distinct from new.id::text then raise exception 'SLEEPER_BLOCKED: exact sleeper leaves required';end if;
  select * into g from public.games where id=(c->>'game_id')::uuid;
  if g.id is null or lower(g.sport)<>'nfl' or g.season is null or g.week is null or g.kickoff_tbd or g.kickoff<=now() or g.kickoff>now()+interval '7 days' then raise exception 'SLEEPER_BLOCKED: confirmed upcoming NFL game required';end if;
  if g.id=any(ids) then raise exception 'SLEEPER_BLOCKED: one sleeper per distinct game';end if;ids:=array_append(ids,g.id);
  if season is not null and (g.season<>season or g.week<>week) then raise exception 'SLEEPER_BLOCKED: one season/week only';end if;
  season:=g.season;week:=g.week;earliest:=least(earliest,g.kickoff);latest:=greatest(latest,g.kickoff);
  m:=regexp_match(coalesce(c->>'market',''),'^Full game · ([0-9]{1,3})\+ (rushing yards|receiving yards|passing yards|receptions)$');
  if m is null or m[1]::integer<1 or length(btrim(coalesce(c->>'name','')))=0
   or c->>'copy_text' is distinct from (c->>'name')||' '||m[1]||'+ '||m[2] then raise exception 'SLEEPER_BLOCKED: exact player/stat-only copy and target required';end if;
  ev:=c->'sleeper_evidence';cutoff:=private.nfl_gate_time(c->>'historical_cutoff');generated:=private.nfl_gate_time(c->>'generated_at');
  if ev ?| array['model_probability','model_id','edge','ev','confidence','validated'] then raise exception 'SLEEPER_BLOCKED: no model claims in evidence';end if;
  if jsonb_typeof(ev) is distinct from 'object' or cutoff is null or generated is null or cutoff>generated or generated>now() or generated<now()-interval '1 hour'
   or coalesce(ev->>'position','') not in ('QB','RB','WR','TE') or (ev->>'position'='TE' and m[2]<>'receptions') then raise exception 'SLEEPER_BLOCKED: fresh cutoff/role and TE receptions required';end if;
  foreach required in array array['opportunity_case','failure_path','matchup_case','availability_status','availability_note'] loop
   if length(btrim(coalesce(ev->>required,'')))=0 then raise exception 'SLEEPER_BLOCKED: missing %',required;end if;
  end loop;
  if ev->>'availability_status' not in ('confirmed_available','questionable','unconfirmed') then raise exception 'SLEEPER_BLOCKED: unavailable player excluded';end if;
  if length(btrim(coalesce(c->>'why','')))=0 or length(btrim(coalesce(c->>'risk','')))=0 or length(btrim(coalesce(c->>'quote_context','')))=0 then raise exception 'SLEEPER_BLOCKED: visible case/risk/unknown market required';end if;
  -- Historical facts remain facts; no priced clear-rate or probability is inferred.
  if jsonb_typeof(ev->'history') is distinct from 'array' or jsonb_array_length(ev->'history')<5 or ev->>'history_window' is distinct from 'latest_consecutive_games' then raise exception 'SLEEPER_BLOCKED: latest five sourced games required';end if;
  history_ids:='{}';sample:=0;
  for x in select value from jsonb_array_elements(ev->'history') loop
   if coalesce(x->>'game_id','')='' or x->>'game_id'=any(history_ids) or private.nfl_gate_number(x->'value') is null
    or private.nfl_gate_time(x->>'played_at') is null or private.nfl_gate_time(x->>'played_at')>=cutoff
    or coalesce(x->>'source_url','') !~ '^https://[^[:space:]]+$' then raise exception 'SLEEPER_BLOCKED: unique historical facts before cutoff required';end if;
   history_ids:=array_append(history_ids,x->>'game_id');sample:=sample+1;
  end loop;
  if jsonb_typeof(c->'source_observation_ids') is distinct from 'array' or jsonb_array_length(c->'source_observation_ids')=0 then raise exception 'SLEEPER_BLOCKED: immutable source observations required';end if;
  foreach required in array array['history_source_url','role_source_url','availability_source_url','weather_source_url'] loop
   source_url:=ev->>required;
   if source_url is null and required='weather_source_url' and length(btrim(coalesce(ev->>'weather_unknown','')))>0 then continue;end if;
   if coalesce(source_url,'') !~ '^https://[^[:space:]]+$' then raise exception 'SLEEPER_BLOCKED: source or explicit weather unknown required';end if;
   if not exists(select 1 from jsonb_array_elements(c->'sources') s where s->>'url'=source_url) then raise exception 'SLEEPER_BLOCKED: displayed sources must match evidence';end if;
   if not exists(select 1 from public.source_observations o cross join lateral jsonb_array_elements(o.payload->'source_files') f
    where o.id::text in(select jsonb_array_elements_text(c->'source_observation_ids')) and o.game_id=g.id and o.recorded_at<=cutoff
    and f->>'url'=source_url and f->>'sha256' ~ '^[a-f0-9]{64}$' and private.nfl_gate_time(f->>'retrieved_at')<=cutoff
    and private.nfl_gate_time(f->>'retrieved_at')>=now()-interval '7 days') then raise exception 'SLEEPER_BLOCKED: hashed source provenance missing';end if;
  end loop;
  keys:=keys||jsonb_build_array('candidate:'||new.id::text||':'||i);
  shown:=shown||jsonb_build_array(jsonb_build_object('name',c->>'name','market',c->>'market'));
  copies:=array_append(copies,c->>'copy_text');
 end loop;
 if new.publication_key !~ ('^worth-a-dollar-'||season||'-week'||week||'-v[0-9]+$') then raise exception 'SLEEPER_BLOCKED: key must match slate';end if;
 if split_part(new.publication_key,'-v',2)::integer<1 or (split_part(new.publication_key,'-v',2)='1' and bundle->>'supersedes_release_id' is not null) then raise exception 'SLEEPER_BLOCKED: original and revision identity invalid';end if;
 if split_part(new.publication_key,'-v',2)<>'1' and coalesce(bundle->>'supersedes_release_id','')='' then raise exception 'SLEEPER_BLOCKED: updates must link original';end if;
 if bundle->>'supersedes_release_id' is not null and not exists(select 1 from public.candidate_releases r where r.id=(bundle->>'supersedes_release_id')::uuid and r.publication_key='worth-a-dollar-'||season||'-week'||week||'-v1') then raise exception 'SLEEPER_BLOCKED: original update link invalid';end if;
 if new.expires_at is distinct from earliest or private.nfl_gate_time(bundle->>'sweat_until')<latest
  or private.nfl_gate_time(bundle->>'sweat_until')>latest+interval '12 hours' or private.nfl_gate_time(bundle->>'sweat_until') is null then raise exception 'SLEEPER_BLOCKED: exact earliest expiry and bounded sweat window required';end if;
 if bundle->'leg_keys' is distinct from keys or bundle->>'copy_text' is distinct from array_to_string(copies,E'\n')
  or jsonb_typeof(bundle->'parlay_legs') is distinct from 'array' or jsonb_array_length(bundle->'parlay_legs')<>array_length(ids,1)
  or exists(select 1 from jsonb_array_elements(shown) expected where not exists(select 1 from jsonb_array_elements(bundle->'parlay_legs') actual where actual->>'name'=expected->>'name' and actual->>'market'=expected->>'market')) then raise exception 'SLEEPER_BLOCKED: displayed ticket and exact leaf references must match';end if;
 insert into private.weekly_sleeper_reviews(release_id,evidence) values(new.id,new.candidates);
 return new;
end $$;
revoke all on function private.enforce_weekly_sleeper() from public,anon,authenticated,service_role;
-- A dedicated strict validator owns only this category. Research and normal picks keep their gates.
drop trigger enforce_nfl_selection_gate on public.candidate_releases;
create trigger enforce_nfl_selection_gate before insert on public.candidate_releases for each row
 when (not private.is_research_release(new.candidates) and not coalesce(private.is_weekly_sleeper(new.candidates),false)) execute function private.enforce_nfl_selection_gate();
create trigger enforce_weekly_sleeper after insert on public.candidate_releases for each row
 when (private.is_weekly_sleeper(new.candidates)) execute function private.enforce_weekly_sleeper();
alter table public.candidate_releases drop constraint candidate_releases_candidates_check;
alter table public.candidate_releases add constraint candidate_releases_candidates_check check(jsonb_typeof(candidates)='array' and jsonb_array_length(candidates) between 1 and
 case when private.is_weekly_sleeper(candidates) then 13 else 12 end);
