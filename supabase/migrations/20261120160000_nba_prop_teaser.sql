-- Prop Finder free teaser (Mike, #308): signed-in free users see tonight's top 2 props in full;
-- logged-out visitors see only the board's prop count and the top edge size. The full board stays
-- members-only (nba_observations member_read). The scheduled teaser job (service role, GitHub
-- secrets) computes the slice with the same code members see and writes this single row.
create table public.nba_prop_teaser (
  id smallint primary key default 1 check (id = 1),
  computed_at timestamptz not null,
  total integer not null check (total >= 0),
  rows jsonb not null check (jsonb_typeof(rows) = 'array' and jsonb_array_length(rows) <= 2)
);
alter table public.nba_prop_teaser enable row level security;
revoke all on table public.nba_prop_teaser from public, anon, authenticated;
grant select on table public.nba_prop_teaser to authenticated;
-- Signed-in and past the 21+ check (the same rule the member tables apply as restrictive).
create policy signed_in_age_eligible_read on public.nba_prop_teaser
  for select to authenticated using ((select private.age_member_allowed()));
-- No insert/update/delete policies: only the service role writes.

-- Visitors: counts only, never a player, line or price.
create function public.nba_prop_teaser_summary() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'total', t.total,
    'top_edge', (select max((r->>'edge')::numeric) from jsonb_array_elements(t.rows) r),
    'computed_at', t.computed_at
  )
  from public.nba_prop_teaser t
  where t.id = 1
$$;
revoke all on function public.nba_prop_teaser_summary() from public;
grant execute on function public.nba_prop_teaser_summary() to anon, authenticated;
