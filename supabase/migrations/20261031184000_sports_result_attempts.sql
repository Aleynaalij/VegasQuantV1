-- Scheduling metadata only. A failed source read must not change result confirmation state.
create table public.sports_result_attempts (
 game_id uuid primary key references public.sports_games(id),
 attempted_at timestamptz not null default now()
);
alter table public.sports_result_attempts enable row level security;
revoke all on public.sports_result_attempts from public,anon,authenticated,service_role;
grant select,insert,update on public.sports_result_attempts to service_role;
