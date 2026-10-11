create table public.game_comments(id uuid primary key default gen_random_uuid(),game_id uuid not null references public.games(id),user_id uuid not null references auth.users(id) on delete cascade,body text not null check(length(trim(body)) between 1 and 1000),created_at timestamptz not null default now());
create index game_comments_game_time on public.game_comments(game_id,created_at desc);
alter table public.game_comments enable row level security;
revoke all on public.game_comments from anon,authenticated;
grant select,insert,delete on public.game_comments to authenticated;
create policy comment_read on public.game_comments for select to authenticated using(true);
create policy comment_insert on public.game_comments for insert to authenticated with check((select auth.uid())=user_id and exists(select 1 from public.community_profiles p where p.user_id=(select auth.uid()) and p.visible and p.avatar is not null and p.username !~* '^Member_[a-f0-9]{8}$'));
create policy comment_delete on public.game_comments for delete to authenticated using((select auth.uid())=user_id or (select public.is_admin()));
create function private.limit_game_comment() returns trigger language plpgsql security definer set search_path='' as $$ begin
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
 if exists(select 1 from public.game_comments where user_id=new.user_id and created_at>now()-interval '10 seconds') then raise exception 'Please wait ten seconds between posts'; end if; return new; end $$;
revoke all on function private.limit_game_comment() from public,anon,authenticated;
create trigger comment_rate_limit before insert on public.game_comments for each row execute function private.limit_game_comment();

