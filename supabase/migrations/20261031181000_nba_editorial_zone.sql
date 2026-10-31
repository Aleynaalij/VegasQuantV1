-- One server-only transaction for the existing guarded NBA editorial journal and ONE Zone.
-- All NBA quote/evidence/revision triggers still run. No model or official release is created.
create function private.publish_nba_editorial_zone(p jsonb,p_expected_author uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare author uuid; pick public.nba_editorial_picks; post uuid;
 old_sub text:=current_setting('request.jwt.claim.sub',true);
 old_claims text:=current_setting('request.jwt.claims',true);
begin
 select user_id into author from private.zone_automation where name='nba_threes';
 if author is null or p_expected_author is null or author<>p_expected_author then raise exception 'NBA editorial author identity mismatch';end if;
 if not coalesce(private.age_eligible(author),false) or not exists(
  select 1 from public.community_profiles where user_id=author and length(trim(username))>=3 and avatar is not null
 ) then raise exception 'NBA editorial author profile or age is not ready';end if;
 if coalesce(p->>'publication_key','')='' then raise exception 'Publication key required';end if;
 perform pg_advisory_xact_lock(hashtextextended('nba-editorial-zone:'||(p->>'publication_key'),0));
 post:=md5('nba-editorial-zone:'||(p->>'publication_key'))::uuid;
 select * into pick from public.nba_editorial_picks where publication_key=p->>'publication_key';
 if found then
  if pick.game_id::text is distinct from p->>'game_id' or pick.quote_observation_id::text is distinct from p->>'quote_observation_id'
   or pick.player is distinct from p->>'player' or pick.market is distinct from p->>'market'
   or pick.direction is distinct from p->>'direction' or pick.line is distinct from (p->>'line')::numeric
   or pick.odds is distinct from (p->>'odds')::integer then raise exception 'Publication key belongs to another immutable selection';end if;
  if not exists(select 1 from public.community_posts where id=post and user_id=author) then raise exception 'Existing editorial Zone post requires review';end if;
  return jsonb_build_object('status','ALREADY_POSTED','pick_id',pick.id,'post_id',post);
 end if;
 insert into public.nba_editorial_picks(publication_key,game_id,quote_observation_id,player,market,direction,line,odds,book,rationale,risk,unknowns,sources,evidence,supersedes_id)
 values(p->>'publication_key',(p->>'game_id')::uuid,(p->>'quote_observation_id')::uuid,p->>'player',p->>'market',p->>'direction',
  (p->>'line')::numeric,(p->>'odds')::integer,p->>'book',p->>'rationale',p->>'risk',p->>'unknowns',p->'sources',p->'evidence',(p->>'supersedes_id')::uuid)
 returning * into pick;
 perform set_config('request.jwt.claim.sub',author::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',author,'role','authenticated')::text,true);
 insert into public.community_posts(id,user_id,sport,kind,title,body,legs)
 values(post,author,'nba','talk',pick.player||' '||pick.direction||' '||pick.line::text||' '||replace(pick.market,'player_',''),
  pick.player||' '||pick.direction||' '||pick.line::text||' '||replace(pick.market,'player_','')||' ('||
  case when pick.odds>0 then '+' else '' end||pick.odds::text||' at FanDuel, observed '||
  to_char(pick.quote_observed_at at time zone 'America/New_York','Mon DD FMHH12:MI AM')||E' ET)\n\n'||pick.rationale||
  E'\n\nRisk: '||pick.risk||E'\n\nUnknowns: '||pick.unknowns||
  E'\n\nQualitative editorial, not a validated model edge. Observed prices can change.\n'||
  coalesce((select string_agg(x->>'url',E'\n') from jsonb_array_elements(pick.sources) x),''),'[]'::jsonb);
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 return jsonb_build_object('status','POSTED','pick_id',pick.id,'post_id',post);
end $$;
revoke all on function private.publish_nba_editorial_zone(jsonb,uuid) from public,anon,authenticated,service_role;
