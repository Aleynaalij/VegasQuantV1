-- Public allowlist for exact published-pick market splits. Private research stays private.
create function private.published_pick_splits(p_pick_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(safe) order by safe.observed_at desc),'[]'::jsonb)
 from (
  select distinct on (s.book) s.book,m.selection,m.opposite,s.line,
   s.ticket_pct,s.handle_pct,s.sample_size,s.sample_window,s.observed_at,s.time_basis,s.source
  from public.intelligence_splits s
  join public.intelligence_markets m on m.id=s.market_id
  join public.official_picks p on p.id=m.official_pick_id
  where p.id=p_pick_id and s.line is not distinct from p.recommended_line
   and m.game_id=p.game_id and m.market_type=p.market
   and s.source ~ '^https://[^[:space:]]+$'
  order by s.book,s.observed_at desc,s.created_at desc,s.id desc
 ) safe;
$$;
revoke all on function private.published_pick_splits(uuid) from public,anon,authenticated;
grant execute on function private.published_pick_splits(uuid) to anon,authenticated;
create function public.published_pick_splits(p_pick_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.published_pick_splits(p_pick_id); $$;
revoke all on function public.published_pick_splits(uuid) from public,anon,authenticated;
grant execute on function public.published_pick_splits(uuid) to anon,authenticated;
