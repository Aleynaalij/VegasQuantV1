-- Member-created combinations are private snapshots, never analyst publications or wagers.
create table public.member_parlays (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 80),
 leg_keys text[] not null check(cardinality(leg_keys) between 2 and 4),
 legs jsonb not null check(jsonb_typeof(legs)='array' and jsonb_array_length(legs) between 2 and 4),
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 unique(user_id,leg_keys)
);
alter table public.member_parlays enable row level security;
revoke all on public.member_parlays from public,anon,authenticated;
grant select,delete on public.member_parlays to authenticated;
create policy own_member_parlays_read on public.member_parlays for select to authenticated using(user_id=(select auth.uid()));
create policy own_member_parlays_delete on public.member_parlays for delete to authenticated using(user_id=(select auth.uid()));
create index member_parlays_owner on public.member_parlays(user_id,created_at desc);

-- Trusted badge evidence comes exclusively from an accepted publishing-gate decision
-- and an approved model. Caller flags / SHADOW_ONLY estimates can never create a badge.
create function private.published_leg_recommendation(p_key text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare l record; d record; c jsonb; s jsonb; price numeric; probability numeric; edge numeric; url text;
begin
 if auth.uid() is null or not private.has_membership() then return null; end if;
 select * into l from public.published_legs where leg_key=p_key;
 if not found or l.result is not null or l.expires_at<=now() then return null; end if;
 select * into d from private.nfl_selection_gate_decisions
 where accepted and entity_id=coalesce(l.release_id,l.official_pick_id)
 and entity=case when l.release_id is null then 'official_picks' else 'candidate_releases' end
 order by created_at desc limit 1;
 if not found then return null; end if;
 c:=d.evidence->(coalesce(l.leg_index,1)-1); s:=c->'selection_gate';
 if c->>'analysis_kind' like '%SHADOW%' or c->>'experimental'='true' then return null; end if;
 select validation_url into url from private.nfl_selection_model_approvals
 where model_id=s->>'model_id' and approved_at<=l.published_at;
 if not found then return null; end if;
 probability:=private.nfl_gate_number(s->'model_probability');price:=private.nfl_gate_number(c->'odds');
 if probability is null or probability not between 0 and 1 or price is null or abs(price)<100 then return null; end if;
 -- Current badges expire with the reviewed exact quote. A past estimate is not a fresh recommendation.
 if private.nfl_gate_time(c->>'quote_observed_at') is null or private.nfl_gate_time(c->>'quote_observed_at')<now()-interval '15 minutes' or private.nfl_gate_time(c->>'quote_observed_at')>now() then return null; end if;
 edge:=probability-case when price<0 then abs(price)/(abs(price)+100) else 100/(price+100) end;
 if edge<0.03 then return null; end if;
 return jsonb_build_object('edge_pp',round(edge*100,2),'model_id',s->>'model_id','validation_url',url);
end $$;
revoke all on function private.published_leg_recommendation(text) from public,anon,authenticated;
grant execute on function private.published_leg_recommendation(text) to authenticated;
create function public.published_leg_catalog(p_since timestamptz default now()-interval '7 days') returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(x) order by x.published_at desc,x.leg_key),'[]'::jsonb) from (
  select l.*,private.published_leg_recommendation(l.leg_key) as recommendation
  from public.published_legs l join public.games g on g.id=l.game_id
  where lower(g.sport)='nfl' and (l.market ~* '[0-9].*((receiving|rushing|passing).*(yards|yds)|receptions|catches)' or (l.market='Player Prop' and l.name ~* '[0-9].*((receiving|rushing|passing).*(yards|yds)|receptions|catches)')) and l.published_at>=greatest(p_since,now()-interval '14 days')
  order by l.published_at desc,l.leg_key
 )x
$$;
revoke all on function public.published_leg_catalog(timestamptz) from public,anon,authenticated;
grant execute on function public.published_leg_catalog(timestamptz) to authenticated;

-- Definer is needed only for insertion into an RPC-only table. It binds ownership
-- to auth.uid and builds every snapshot from the authoritative published record.
create function private.create_member_parlay(p_title text,p_leg_keys text[]) returns uuid
language plpgsql security definer set search_path='' as $$
declare keys text[]; key text; l record; g record; snapshot jsonb:='[]'; expires timestamptz; families text[]:='{}'; family text; player text; market text; result uuid;
begin
 if auth.uid() is null or not private.has_membership() then raise exception 'Sign in with an active account'; end if;
 if p_title is null or length(trim(p_title)) not between 1 and 80 then raise exception 'Use a name under 80 characters'; end if;
 if p_leg_keys is null or cardinality(p_leg_keys) not between 2 and 4 or array_position(p_leg_keys,null) is not null then raise exception 'Choose two to four published legs'; end if;
 select array_agg(k order by k) into keys from (select distinct unnest(p_leg_keys) k)x;
 if cardinality(keys)<>cardinality(p_leg_keys) then raise exception 'Duplicate legs are not allowed'; end if;
 foreach key in array keys loop
  select * into l from public.published_legs where leg_key=key;
  if not found or l.result is not null or l.expires_at<=now() then raise exception 'A selected leg is no longer available'; end if;
  select * into g from public.games where id=l.game_id;
  if not found or lower(g.sport)<>'nfl' or g.kickoff_tbd or g.kickoff<=now() then raise exception 'Choose upcoming NFL player legs'; end if;
  if l.market !~* '(receiving|rushing|passing).*(yards|yds)|receptions|catches' and not (l.market='Player Prop' and l.name ~* '(receiving|rushing|passing).*(yards|yds)|receptions|catches') then raise exception 'Only supported player-stat legs can be combined'; end if;
  if (l.market||' '||l.name) ~* '(quarter|half|live)' then raise exception 'Choose pregame full-game legs'; end if;
  market:=case when l.market='Player Prop' then l.name else l.market end;
  player:=case when l.market='Player Prop' then regexp_replace(l.name,'\s+(over\s+|under\s+)?[0-9]+(\.[0-9]+)?\+?\s+.*$','','i') else l.name end;
  family:=g.id::text||':'||lower(trim(player))||':'||case when market ~* 'receiving' then 'receiving' when market ~* 'rushing' then 'rushing' when market ~* 'passing' then 'passing' else 'receptions' end;
  if family=any(families) then raise exception 'Choose one target per player and statistic'; end if;
  families:=array_append(families,family);
  snapshot:=snapshot||jsonb_build_array(to_jsonb(l));
  expires:=least(expires,g.kickoff,l.expires_at);
 end loop;
 insert into public.member_parlays(user_id,title,leg_keys,legs,expires_at) values(auth.uid(),trim(p_title),keys,snapshot,expires)
 on conflict(user_id,leg_keys) do update set title=member_parlays.title returning id into result;
 return result;
end $$;
revoke all on function private.create_member_parlay(text,text[]) from public,anon,authenticated;
grant execute on function private.create_member_parlay(text,text[]) to authenticated;
create function public.create_member_parlay(p_title text,p_leg_keys text[]) returns uuid
language sql security invoker set search_path='' as $$select private.create_member_parlay(p_title,p_leg_keys)$$;
revoke all on function public.create_member_parlay(text,text[]) from public,anon,authenticated;
grant execute on function public.create_member_parlay(text,text[]) to authenticated;
