-- Register the immutable v0.3 artifact so the hosted shadow scan (research/probability/hosted_scan.py)
-- can journal prospective forecasts. Registration is NOT validation approval: the manifest status is
-- SHADOW_ONLY and private.nfl_selection_model_approvals stays empty (see qualification.md).
insert into private.nfl_shadow_model_manifests(model_id, artifact_sha256, artifact_url, status) values(
 '4838aea2c8cd5618f9873d896cd6f3405a5f7b24f140d32ce442900905d8daa1',
 '203dc02d34c6b6e6581d17438dde3b86c6b2a87fc8950ee6c9c7286b0067e2a0',
 'https://raw.githubusercontent.com/Aleynaalij/VegasQuantV1/c6cbce1af26e722aa4deab74eb27c22a157010ba/research/probability/artifacts/v0.3/model.json',
 'SHADOW_ONLY'
) on conflict (model_id) do nothing;

-- Administrators see the latest prospective shadow forecast that matches each published leg's exact
-- player, stat, direction and line. Members never see it while the model is SHADOW_ONLY.
create function private.admin_leg_model_estimates(p_keys text[])
returns table(leg_key text, research_probability numeric, push_probability numeric, direction text,
 line numeric, odds numeric, blockers integer, recorded_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Verified administrator required' using errcode = '42501'; end if;
 return query
 select distinct on (c.leg_key) c.leg_key,
  (f.forecast->>'research_probability')::numeric,
  coalesce((f.forecast->>'push_probability')::numeric, 0),
  f.direction, f.line, (f.forecast->'quote'->>'odds')::numeric,
  coalesce(jsonb_array_length(f.forecast->'blockers'), 0), f.recorded_at
 from private.leg_result_contracts c
 join private.nfl_shadow_forecasts f on f.game_id = c.game_id
  and regexp_replace(lower(f.player), '[^a-z0-9]', '', 'g') = regexp_replace(lower(regexp_replace(c.player, '\s+(Jr\.?|Sr\.?|II|III|IV)$', '', 'i')), '[^a-z0-9]', '', 'g')
  and f.market = case c.metric when 'rushing_yards' then 'rushing' when 'receiving_yards' then 'receiving' end
  and f.direction = case c.operator when 'under' then 'under' else 'over' end
  and f.line = case c.operator when 'gte' then c.threshold - 0.5 else c.threshold end
 where c.leg_key = any(p_keys[1:200])
 order by c.leg_key, f.recorded_at desc;
end $$;
revoke all on function private.admin_leg_model_estimates(text[]) from public, anon, service_role;
grant execute on function private.admin_leg_model_estimates(text[]) to authenticated;
create function public.admin_leg_model_estimates(p_keys text[])
returns table(leg_key text, research_probability numeric, push_probability numeric, direction text,
 line numeric, odds numeric, blockers integer, recorded_at timestamptz)
language sql stable security invoker set search_path='' as $$ select * from private.admin_leg_model_estimates(p_keys); $$;
revoke all on function public.admin_leg_model_estimates(text[]) from public, anon;
grant execute on function public.admin_leg_model_estimates(text[]) to authenticated;
