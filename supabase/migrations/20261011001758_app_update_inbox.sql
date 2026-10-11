create table public.app_updates(id uuid primary key default gen_random_uuid(),title text not null,body text not null,created_at timestamptz not null default now());
create table public.app_update_reads(user_id uuid references auth.users(id) on delete cascade,update_id uuid references public.app_updates(id) on delete cascade,read_at timestamptz not null default now(),primary key(user_id,update_id));

alter table public.app_update_reads enable row level security;
revoke all on public.app_update_reads from anon,authenticated;
grant select,insert,delete on public.app_update_reads to authenticated;
create policy own_read on public.app_update_reads for select to authenticated using((select auth.uid())=user_id);
create policy own_insert on public.app_update_reads for insert to authenticated with check((select auth.uid())=user_id);
create policy own_delete on public.app_update_reads for delete to authenticated using((select auth.uid())=user_id);
alter table public.app_updates enable row level security;
revoke all on public.app_updates from anon,authenticated;
grant select,insert on public.app_updates to authenticated;
create policy update_read on public.app_updates for select to authenticated using(true);
create policy update_publish on public.app_updates for insert to authenticated with check((select public.is_admin()));

