-- Published selections remain the immutable source of truth.
create table public.research_leg_results (
 leg_key text primary key, result text not null check(result in ('WIN','LOSS','PUSH','VOID')),
 source_url text not null check(source_url ~ '^https://'), verified_at timestamptz not null default now()
);
alter table public.research_leg_results enable row level security;
revoke all on public.research_leg_results from anon,authenticated;
grant select,insert on public.research_leg_results to authenticated;
create policy research_result_read on public.research_leg_results for select to authenticated using(true);
create policy research_result_owner on public.research_leg_results for insert to authenticated with check((select public.is_admin()));
create trigger immutable_research_results before update or delete on public.research_leg_results for each row execute function private.immutable();
create view public.published_legs with(security_invoker=true) as
 select 'candidate:'||r.id::text||':'||c.ordinality::text as leg_key, r.id as release_id,
 c.ordinality::integer as leg_index, null::uuid as official_pick_id,
 case when (c.value->>'game_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then (c.value->>'game_id')::uuid else s.game_id end as game_id,
 case when c.value->>'fun_play'='true' then 'HAIL_MARY' when c.value->>'pick_of_day'='true' then 'PICK_OF_DAY' else 'SINGLE' end as kind,
 c.value->>'name' as name,c.value->>'market' as market,c.value->>'matchup' as matchup,c.value->>'quote' as quote,
 c.value->>'quote_observed_at' as quote_observed_at,c.value->>'gambly_url' as gambly_url,
 c.value->>'copy_text' as copy_text,c.value->>'why' as why,c.value->>'risk' as risk,
 r.created_at as published_at,r.expires_at,rr.result,rr.source_url as result_source
 from public.candidate_releases r cross join lateral jsonb_array_elements(r.candidates) with ordinality c(value,ordinality)
 left join public.challenge_stages s on s.id=r.stage_id left join public.research_leg_results rr on rr.leg_key='candidate:'||r.id::text||':'||c.ordinality::text
 union all
 select 'official:'||p.id::text,null::uuid,null::integer,p.id,p.game_id,'OFFICIAL',p.selection,p.market,
 g.away_team||' @ '||g.home_team,p.book||' '||case when p.odds>0 then '+' else '' end||p.odds::text,
 p.known_at_publication->>'quote_observed_at',p.gambly_url,null::text,p.why_like,p.why_lose,p.created_at,g.kickoff,
 pr.result::text,pr.source from public.official_picks p join public.games g on g.id=p.game_id left join public.pick_results pr on pr.pick_id=p.id;
revoke all on public.published_legs from anon,authenticated;
grant select on public.published_legs to authenticated;

