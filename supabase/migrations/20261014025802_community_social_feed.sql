-- Member publications are distinct from analyst releases and never record wagers.
create table public.community_posts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 sport text not null check(sport in ('nfl','nba')), kind text not null check(kind in ('slip','talk','result')),
 constraint nba_preparation_posts check(sport<>'nba' or kind='talk'),
 title text not null check(length(trim(title)) between 1 and 120), body text not null check(length(trim(body)) between 1 and 2000),
 legs jsonb not null default '[]' check(jsonb_typeof(legs)='array' and jsonb_array_length(legs)<=12),
 stake numeric(12,2) check(stake>=0 and stake<=1000000),
 author_name text not null default '', created_at timestamptz not null default now()
);
create index community_posts_latest on public.community_posts(sport,created_at desc);
create index community_posts_author on public.community_posts(user_id,created_at desc);
create table public.community_post_comments (
 id uuid primary key default gen_random_uuid(),post_id uuid not null references public.community_posts(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,author_name text not null default '',
 body text not null check(length(trim(body)) between 1 and 1000),created_at timestamptz not null default now()
);
create index community_comments_post on public.community_post_comments(post_id,created_at);
create index community_comments_user on public.community_post_comments(user_id,created_at desc);
create table public.community_reactions (
 post_id uuid not null references public.community_posts(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),primary key(post_id,user_id)
);
create table public.member_follows (
 user_id uuid not null references auth.users(id) on delete cascade,target_user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),primary key(user_id,target_user_id),check(user_id<>target_user_id)
);
create table public.community_reports (
 id uuid primary key default gen_random_uuid(),post_id uuid not null references public.community_posts(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,reason text not null check(length(trim(reason)) between 1 and 500),
 created_at timestamptz not null default now(),unique(post_id,user_id)
);
-- Invoker trigger reads only the caller's existing private profile. It snapshots the
-- voluntarily published username; it does not expose the private profile table.
create function private.prepare_member_publication() returns trigger language plpgsql security invoker set search_path='' as $$
declare username text; begin
 if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'Sign in as the author'; end if;
 select p.username into username from public.community_profiles p where p.user_id=auth.uid() and p.visible and p.avatar is not null and p.username !~* '^Member_[a-f0-9]{8}$';
 if username is null then raise exception 'Complete and enable your community profile first'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,420));
 if TG_TABLE_NAME='community_posts' then
  if exists(select 1 from public.community_posts where user_id=auth.uid() and created_at>now()-interval '30 seconds') then raise exception 'Wait thirty seconds between posts'; end if;
  if exists(select 1 from jsonb_array_elements(new.legs) l where jsonb_typeof(l)<>'string' or length(l#>>'{}') not between 1 and 180) then raise exception 'Use up to twelve text selections'; end if;
  if new.kind='slip' and jsonb_array_length(new.legs)=0 then raise exception 'Add at least one selection'; end if;
 else
  if exists(select 1 from public.community_post_comments where user_id=auth.uid() and created_at>now()-interval '10 seconds') then raise exception 'Wait ten seconds between comments'; end if;
 end if;
 new.author_name=username;new.created_at=now();return new;end $$;
create trigger prepare_community_post before insert on public.community_posts for each row execute function private.prepare_member_publication();
create trigger prepare_community_comment before insert on public.community_post_comments for each row execute function private.prepare_member_publication();
alter table public.community_posts enable row level security;
alter table public.community_post_comments enable row level security;
alter table public.community_reactions enable row level security;
alter table public.member_follows enable row level security;
alter table public.community_reports enable row level security;
revoke all on public.community_posts,public.community_post_comments,public.community_reactions,public.member_follows,public.community_reports from public,anon,authenticated;
grant select,insert,delete on public.community_posts,public.community_post_comments,public.community_reactions,public.member_follows to authenticated;
grant select,insert on public.community_reports to authenticated;
create policy community_posts_read on public.community_posts for select to authenticated using(true);
create policy community_posts_insert on public.community_posts for insert to authenticated with check(user_id=(select auth.uid()));
create policy community_posts_delete on public.community_posts for delete to authenticated using(user_id=(select auth.uid()) or (select public.is_admin()));
create policy community_comments_read on public.community_post_comments for select to authenticated using(true);
create policy community_comments_insert on public.community_post_comments for insert to authenticated with check(user_id=(select auth.uid()));
create policy community_comments_delete on public.community_post_comments for delete to authenticated using(user_id=(select auth.uid()) or (select public.is_admin()));
create policy community_reactions_read on public.community_reactions for select to authenticated using(true);
create policy community_reactions_insert on public.community_reactions for insert to authenticated with check(user_id=(select auth.uid()));
create policy community_reactions_delete on public.community_reactions for delete to authenticated using(user_id=(select auth.uid()));
create policy member_follows_read on public.member_follows for select to authenticated using(user_id=(select auth.uid()));
create policy member_follows_insert on public.member_follows for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.community_posts p where p.user_id=target_user_id));
create policy member_follows_delete on public.member_follows for delete to authenticated using(user_id=(select auth.uid()));
create policy community_reports_read on public.community_reports for select to authenticated using(user_id=(select auth.uid()) or (select public.is_admin()));
create policy community_reports_insert on public.community_reports for insert to authenticated with check(user_id=(select auth.uid()));
revoke all on function private.prepare_member_publication() from public,anon,authenticated;
create function public.community_feed(p_sport text default 'nfl',p_limit integer default 20,p_following boolean default false) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
 select p.*,(select count(*) from public.community_reactions r where r.post_id=p.id) as reactions,
 exists(select 1 from public.community_reactions r where r.post_id=p.id and r.user_id=auth.uid()) as reacted,
 (select count(*) from public.community_post_comments c where c.post_id=p.id) as comments,
 exists(select 1 from public.member_follows f where f.user_id=auth.uid() and f.target_user_id=p.user_id) as following
 from public.community_posts p where p.sport=p_sport and (not p_following or exists(select 1 from public.member_follows f where f.user_id=auth.uid() and f.target_user_id=p.user_id))
 order by p.created_at desc,p.id desc limit greatest(1,least(p_limit,100))
 )x
$$;
revoke all on function public.community_feed(text,integer,boolean) from public,anon,authenticated;
grant execute on function public.community_feed(text,integer,boolean) to authenticated;
