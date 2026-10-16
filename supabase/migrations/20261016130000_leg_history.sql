-- Recent form for each published, gradable pick: how often the player cleared the pick's target
-- in his last five regular-season games before that game (nflverse weekly stats). Written once by
-- result-sync and never changed, so it always shows what was known when the pick went out. A pick
-- with no usable history (no prior games, or a name shared by two players) is stored with sample 0.
create table public.leg_history(
 leg_key text primary key references private.leg_result_contracts(leg_key),
 player_id text,
 position text,
 games jsonb not null check(jsonb_typeof(games) = 'array'),
 cleared integer not null check(cleared >= 0),
 sample integer not null check(sample between 0 and 10 and cleared <= sample),
 median numeric,
 computed_at timestamptz not null default now()
);
alter table public.leg_history enable row level security;
grant select on public.leg_history to authenticated;
create policy leg_history_read on public.leg_history for select to authenticated
 using((select private.has_membership()) and (select private.age_member_allowed()));
grant select, insert on public.leg_history to service_role;
