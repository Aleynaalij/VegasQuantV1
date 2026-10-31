-- Context refresh scheduling is independent of immutable, content-deduplicated source facts.
create table public.sports_context_attempts (
 game_id uuid primary key references public.sports_games(id),
 attempted_at timestamptz not null default now(),
 next_attempt_at timestamptz not null default now()+interval '15 minutes'
);
alter table public.sports_context_attempts enable row level security;
revoke all on public.sports_context_attempts from public,anon,authenticated,service_role;
grant select,insert,update on public.sports_context_attempts to service_role;
