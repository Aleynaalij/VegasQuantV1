-- Append-only analyst feed. Deploy with an authorized database connection.
create table if not exists public.research_feed_posts (
 id uuid primary key default gen_random_uuid(),
 game_id uuid references public.games(id),
 category text not null check(category in ('Watchlist','Injury watch','Market update','Decision')),
 title text not null check(length(title) between 1 and 160),
 summary text not null check(length(summary) between 1 and 600),
 matchup text not null check(length(matchup) between 1 and 160),
 away_code text not null check(length(away_code) between 1 and 6),
 home_code text not null check(length(home_code) between 1 and 6),
 market_label text not null check(length(market_label) between 1 and 180),
 why_watch text not null check(length(why_watch) between 1 and 2000),
 caution text not null check(length(caution) between 1 and 2000),
 next_check text not null check(length(next_check) between 1 and 1000),
 source_url text not null check(source_url ~ '^https://'),
 source_at timestamptz not null check(source_at <= now()),
 created_at timestamptz not null default now(),
 author_id uuid default auth.uid() references auth.users(id)
);
alter table public.research_feed_posts enable row level security;
revoke all on public.research_feed_posts from anon, authenticated;
grant select on public.research_feed_posts to authenticated;
grant insert on public.research_feed_posts to authenticated;
create policy member_read on public.research_feed_posts for select to authenticated using ((select private.has_membership()));
create policy admin_publish on public.research_feed_posts for insert to authenticated with check ((select private.is_admin()) and author_id=(select auth.uid()));
create index research_feed_newest on public.research_feed_posts(created_at desc,id);
create index research_feed_game on public.research_feed_posts(game_id);
create index research_feed_author on public.research_feed_posts(author_id);
create trigger prevent_rewrite before update or delete on public.research_feed_posts for each row execute function private.immutable();
create trigger audit_change after insert on public.research_feed_posts for each row execute function private.audit_change();
