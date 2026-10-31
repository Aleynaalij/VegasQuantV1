-- Preserve source retractions as immutable correction evidence and suspend grading.
-- Stop rather than overwrite a concurrent change to this exact helper.
do $$begin
 if (select md5(prosrc) from pg_proc where oid='private.record_sport_result(jsonb)'::regprocedure)
   not in ('d9124a7269040e81f98a04a8bdb8f8b9','b2bb1d3f9add4d62e3154ea4d4c71115') then
  raise exception 'Result helper changed; coordinate before applying retraction correction';
 end if;
end $$;
create or replace function private.record_sport_result(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.sports_games;s uuid;fp text;prior public.sports_results;st private.sports_result_staging;r jsonb; side text;score integer;total integer;state text;reason text;shoot boolean;
begin
 select * into g from public.sports_games where sport=p->>'sport' and provider_id=p->>'provider_id';
 if not found then raise exception 'Unknown result game';end if;
 perform pg_advisory_xact_lock(hashtextextended('sport-result:'||g.id::text,0));
 s:=private.sports_source(p->'source');
 if p->>'completed' is distinct from 'true' or p->>'status' is distinct from 'STATUS_FINAL' then
  if exists(select 1 from public.sports_results where game_id=g.id) then
   fp:=encode(sha256(convert_to(jsonb_build_object('retracted_final',p-'source')::text,'UTF8')),'hex');
   insert into private.sports_result_corrections(game_id,source_id,payload,fingerprint)
   values(g.id,s,p-'source',fp) on conflict do nothing;
   state:='CONFLICT';reason:='Source retracted recorded final: '||coalesce(p->>'status','unknown')||'; original retained; grading suspended';
  else
   -- A retracted provisional final cannot keep its old confirmation clock.
   delete from private.sports_result_staging where game_id=g.id;
   state:=case when p->>'status' in ('STATUS_CANCELED','STATUS_POSTPONED','STATUS_SUSPENDED') then 'NO_RESULT' else 'AWAITING_FINAL' end;
   reason:='Source status '||coalesce(p->>'status','unknown');
  end if;
 else
  if g.start_time>now() or coalesce(p->>'away_score','')!~'^\d+$' or coalesce(p->>'home_score','')!~'^\d+$' or p->>'away_score'=p->>'home_score'
  or jsonb_typeof(p->'players') is distinct from 'array' or jsonb_array_length(p->'players')=0 then raise exception 'Invalid final';end if;
  shoot:=coalesce((p->>'shootout')::boolean,false);
  if (select count(*)<>count(distinct x->>'athlete_id') from jsonb_array_elements(p->'players')x) then raise exception 'Duplicate athlete';end if;
  for r in select value from jsonb_array_elements(p->'players') loop
   if coalesce(r->>'athlete_id','')!~'^\d+$' or coalesce(r->>'player','')='' or coalesce(r->>'side','') not in ('away','home') or jsonb_typeof(r->'played') is distinct from 'boolean'
    or ((r->>'played')::boolean and (coalesce(r->>'points','')!~'^\d+$' or coalesce(r->>'assists','')!~'^\d+$' or coalesce(r->>'seconds','')!~'^\d+$'))
    or (g.sport='nhl' and (r->>'played')::boolean and (coalesce(r->>'goals','')!~'^\d+$' or (r->>'points')::int<>(r->>'goals')::int+(r->>'assists')::int)) then raise exception 'Invalid player final';end if;
  end loop;
  foreach side in array array['away','home'] loop
   score:=(p->>(side||'_score'))::int;
   select sum((x->>case when g.sport='nhl' then 'goals' else 'points' end)::int) into total from jsonb_array_elements(p->'players')x where x->>'side'=side and (x->>'played')::boolean;
   if total is null or (g.sport='ncaab' and total<>score) or (g.sport='nhl' and (total>score or score-total>1 or (not shoot and score<>total))) then raise exception 'Player score conservation failed';end if;
  end loop;
  if g.sport='nhl' and (p->>'away_score')::int+(p->>'home_score')::int-(select sum((x->>'goals')::int) from jsonb_array_elements(p->'players')x where (x->>'played')::boolean)<>(case when shoot then 1 else 0 end) then raise exception 'Shootout score conservation failed';end if;
  fp:=encode(sha256(convert_to(jsonb_build_object('away_score',p->'away_score','home_score',p->'home_score','shootout',shoot,'players',(select jsonb_agg(x order by x->>'athlete_id') from jsonb_array_elements(p->'players')x))::text,'UTF8')),'hex');
  select * into prior from public.sports_results where game_id=g.id;
  if found then
   if prior.fingerprint=fp then
    -- A prior conflict is sticky until reviewed; do not erase correction evidence.
    select status into state from public.sports_result_progress where game_id=g.id;
    state:=case when state='CONFLICT' then 'CONFLICT' else 'FINAL' end;reason:='Recorded final unchanged';
   else
    insert into private.sports_result_corrections(game_id,source_id,payload,fingerprint) values(g.id,s,p-'source',fp) on conflict do nothing;
    state:='CONFLICT';reason:='Source changed after recorded final; original retained';
   end if;
  else
   select * into st from private.sports_result_staging where game_id=g.id;
   if not found or st.fingerprint<>fp then
    insert into private.sports_result_staging values(g.id,fp,now()) on conflict(game_id) do update set fingerprint=excluded.fingerprint,first_seen_at=excluded.first_seen_at;
    state:='CONFIRMING';reason:='Consistent box score; waiting 3 hours for unchanged confirmation';
   elsif now()-st.first_seen_at<interval '3 hours' then state:='CONFIRMING';reason:='Confirmation interval not elapsed';
   else
    insert into public.sports_results(game_id,source_id,fingerprint,payload) values(g.id,s,fp,p-'source');state:='FINAL';reason:='Box score unchanged for 3 hours';
   end if;
  end if;
 end if;
 insert into public.sports_result_progress(game_id,status,reason) values(g.id,state,reason) on conflict(game_id) do update set status=excluded.status,reason=excluded.reason,checked_at=now();
 return jsonb_build_object('game_id',g.id,'status',state,'reason',reason);
end $$;
