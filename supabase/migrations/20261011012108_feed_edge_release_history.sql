-- Feed history needs more than the latest Home release. Return only the same
-- already-public immutable snapshot fields; preserve the existing Home RPC.
create or replace function private.feed_edge_releases(p_limit integer default 13)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc, official_pick_id desc), '[]'::jsonb)
  from (
    select official_pick_id, created_at, items
    from public.edge_releases
    order by created_at desc, official_pick_id desc
    limit greatest(1, least(coalesce(p_limit, 13), 1000))
  ) x;
$$;
revoke all on function private.feed_edge_releases(integer) from public, anon, authenticated;
grant execute on function private.feed_edge_releases(integer) to anon, authenticated;
create or replace function public.feed_edge_releases(p_limit integer default 13)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.feed_edge_releases(p_limit);
$$;
revoke all on function public.feed_edge_releases(integer) from public, anon, authenticated;
grant execute on function public.feed_edge_releases(integer) to anon, authenticated;
