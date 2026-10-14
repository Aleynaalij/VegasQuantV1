-- Blocking is private to its owner. The helper sees incoming blocks only to enforce
-- the current caller's boundary; it cannot inspect relationships for another caller.
create table public.member_blocks (
 user_id uuid not null references auth.users(id) on delete cascade,
 target_user_id uuid not null references auth.users(id) on delete cascade,
 label text not null default 'Member' check(length(label)<=80),
 created_at timestamptz not null default now(),primary key(user_id,target_user_id),check(user_id<>target_user_id)
);
alter table public.member_blocks enable row level security;
revoke all on public.member_blocks from public,anon,authenticated;
grant select,insert,delete on public.member_blocks to authenticated;
create policy member_blocks_read on public.member_blocks for select to authenticated using(user_id=(select auth.uid()));
create policy member_blocks_add on public.member_blocks for insert to authenticated with check(user_id=(select auth.uid()));
create policy member_blocks_remove on public.member_blocks for delete to authenticated using(user_id=(select auth.uid()));
create function private.community_member_allowed(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and not exists(select 1 from public.member_blocks b where (b.user_id=auth.uid() and b.target_user_id=target) or (b.target_user_id=auth.uid() and b.user_id=target))
$$;
revoke all on function private.community_member_allowed(uuid) from public,anon;
grant execute on function private.community_member_allowed(uuid) to authenticated;
alter policy community_posts_read on public.community_posts using(private.community_member_allowed(user_id) or (select public.is_admin()));
alter policy community_comments_read on public.community_post_comments using(private.community_member_allowed(user_id) or (select public.is_admin()));

create table private.community_restrictions (
 user_id uuid primary key references auth.users(id) on delete cascade,
 reason text not null check(length(trim(reason)) between 1 and 500),created_at timestamptz not null default now()
);
alter table private.community_restrictions enable row level security;
revoke all on private.community_restrictions from public,anon,authenticated;
create function public.restrict_community_member(p_user uuid,p_reason text,p_restricted boolean default true) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Admin required';end if;
 if p_user=auth.uid() then raise exception 'Cannot restrict your own admin account';end if;
 if p_restricted then insert into private.community_restrictions(user_id,reason) values(p_user,p_reason) on conflict(user_id) do update set reason=excluded.reason,created_at=now();
 else delete from private.community_restrictions where user_id=p_user;end if;
end $$;
revoke all on function public.restrict_community_member(uuid,text,boolean) from public,anon;
grant execute on function public.restrict_community_member(uuid,text,boolean) to authenticated;
-- Definer is required solely to read private restrictions; callers cannot bypass
-- the signed-in actor check. Trigger keeps the existing author/rate-limit checks.
create function private.community_safety_check() returns trigger language plpgsql security definer set search_path='' as $$
declare text_content text; target uuid;begin
 if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'Sign in as the author';end if;
 if exists(select 1 from private.community_restrictions r where r.user_id=auth.uid()) then raise exception 'Community posting restricted; use Help & Support';end if;
 if TG_TABLE_NAME='community_posts' then text_content=new.title||' '||new.body||' '||new.legs::text;
 elsif TG_TABLE_NAME in ('community_post_comments','game_comments') then text_content=new.body;
 else text_content='';end if;
 if text_content ~* '(guaranteed (profit|returns|win)|risk[- ]free (bet|profit)|kill yourself|i will kill you|javascript:|<script)' then raise exception 'Remove harmful content, executable links or guaranteed-return claims';end if;
 if TG_TABLE_NAME in ('community_post_comments','community_reactions','community_reports') then
  select user_id into target from public.community_posts where id=new.post_id;
  if target is null or not private.community_member_allowed(target) then raise exception 'Post unavailable';end if;
 elsif TG_TABLE_NAME='member_follows' then
  if not private.community_member_allowed(new.target_user_id) then raise exception 'Member unavailable';end if;
 end if;
 return new;
end $$;
revoke all on function private.community_safety_check() from public,anon,authenticated;
create trigger safety_post before insert on public.community_posts for each row execute function private.community_safety_check();
create trigger safety_comment before insert on public.community_post_comments for each row execute function private.community_safety_check();
create trigger safety_game_comment before insert on public.game_comments for each row execute function private.community_safety_check();
create trigger safety_reaction before insert on public.community_reactions for each row execute function private.community_safety_check();
create trigger safety_follow before insert on public.member_follows for each row execute function private.community_safety_check();
create trigger safety_report before insert on public.community_reports for each row execute function private.community_safety_check();

-- Request initiation is not deletion. No cleanup, financial or immutable record
-- is altered until the separately reviewed deletion worker is implemented.
create table public.account_deletion_requests (
 id uuid primary key default gen_random_uuid(),user_id uuid not null unique references auth.users(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','processing','completed','canceled')),
 requested_at timestamptz not null default now(),resolved_at timestamptz
);
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from public,anon,authenticated;
grant select on public.account_deletion_requests to authenticated;
create policy deletion_request_read on public.account_deletion_requests for select to authenticated using(user_id=(select auth.uid()) or (select public.is_admin()));
create function public.request_account_deletion() returns uuid language plpgsql security definer set search_path='' as $$
declare request_id uuid;begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 insert into public.account_deletion_requests(user_id) values(auth.uid()) on conflict(user_id) do update set status='pending',requested_at=now(),resolved_at=null where account_deletion_requests.status='canceled' returning id into request_id;
 if request_id is null then select id into request_id from public.account_deletion_requests where user_id=auth.uid();end if;
 return request_id;
end $$;
revoke all on function public.request_account_deletion() from public,anon;
grant execute on function public.request_account_deletion() to authenticated;
create function public.cancel_account_deletion_request() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 update public.account_deletion_requests set status='canceled',resolved_at=now() where user_id=auth.uid() and status='pending';
end $$;
revoke all on function public.cancel_account_deletion_request() from public,anon;
grant execute on function public.cancel_account_deletion_request() to authenticated;
