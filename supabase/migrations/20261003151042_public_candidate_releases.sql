-- Explicit, public research publications; no account or premium analysis data.
create table public.candidate_releases (
 id uuid primary key default gen_random_uuid(),
 stage_id uuid not null references public.challenge_stages(id),
 title text not null,
 candidates jsonb not null check(jsonb_typeof(candidates)='array' and jsonb_array_length(candidates) between 1 and 12),
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 publication_key text not null unique
);
alter table public.candidate_releases enable row level security;
revoke all on public.candidate_releases from anon, authenticated;
grant select on public.candidate_releases to anon, authenticated;
create policy public_research_read on public.candidate_releases for select to anon, authenticated using (true);
create index candidate_releases_stage_latest on public.candidate_releases(stage_id,created_at desc);
create trigger prevent_rewrite before update or delete on public.candidate_releases for each row execute function private.immutable();
