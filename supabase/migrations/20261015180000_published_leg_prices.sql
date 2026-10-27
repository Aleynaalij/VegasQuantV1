-- Expose each publication's structured price (American odds) and, for price revisions, the
-- original leg key, so Records can show profit at published prices and count a repriced pick once.
-- Columns are appended; everything else in the view is unchanged.
create or replace view public.published_legs with (security_invoker = true) as
 select 'candidate:'||r.id::text||':'||c.ordinality::text as leg_key,
  r.id as release_id,
  c.ordinality::integer as leg_index,
  null::uuid as official_pick_id,
  case when (c.value->>'game_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   then (c.value->>'game_id')::uuid else s.game_id end as game_id,
  case when (c.value->>'parlay') = 'true' then 'PARLAY'
   when (c.value->>'fun_play') = 'true' then 'HAIL_MARY'
   when (c.value->>'pick_of_day') = 'true' then 'PICK_OF_DAY'
   else 'SINGLE' end as kind,
  c.value->>'name' as name,
  c.value->>'market' as market,
  c.value->>'matchup' as matchup,
  c.value->>'quote' as quote,
  c.value->>'quote_observed_at' as quote_observed_at,
  c.value->>'gambly_url' as gambly_url,
  c.value->>'copy_text' as copy_text,
  c.value->>'why' as why,
  c.value->>'risk' as risk,
  r.created_at as published_at,
  r.expires_at,
  rr.result,
  rr.source_url as result_source,
  -- Nested CASE: the cast only runs once the text is known to be numeric.
  case when (c.value->>'odds') ~ '^[+-]?[0-9]{3,5}(\.0+)?$'
   then case when abs((c.value->>'odds')::numeric) >= 100 then (c.value->>'odds')::numeric end end as odds,
  nullif(c.value->>'original_leg_key', '') as original_leg_key
 from public.candidate_releases r
  cross join lateral jsonb_array_elements(r.candidates) with ordinality c(value, ordinality)
  left join public.challenge_stages s on s.id = r.stage_id
  left join public.research_leg_results rr on rr.leg_key = 'candidate:'||r.id::text||':'||c.ordinality::text
union all
 select 'official:'||p.id::text as leg_key,
  null::uuid as release_id,
  null::integer as leg_index,
  p.id as official_pick_id,
  p.game_id,
  'OFFICIAL' as kind,
  p.selection as name,
  p.market,
  g.away_team||' @ '||g.home_team as matchup,
  p.book||' '||case when p.odds > 0 then '+' else '' end||p.odds::text as quote,
  p.known_at_publication->>'quote_observed_at' as quote_observed_at,
  p.gambly_url,
  null::text as copy_text,
  p.why_like as why,
  p.why_lose as risk,
  p.created_at as published_at,
  g.kickoff as expires_at,
  pr.result,
  pr.source as result_source,
  p.odds,
  null::text as original_leg_key
 from public.official_picks p
  join public.games g on g.id = p.game_id
  left join public.pick_results pr on pr.pick_id = p.id;
