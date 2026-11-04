-- Comments on VIP contributor lays (ruby_cards view over ruby_submissions), so every Zone item can be
-- discussed. Same rules as member post comments: a complete visible community profile, the same
-- member gate as reactions (confirmed, not banned, restricted or erasing, age-eligible), the shared
-- ten-second gap between comments, the same harmful-content screen, 1-1000 characters, replies only
-- within the same lay, authors you have blocked (or who blocked you) hidden, author or admin
-- removal. Reads and writes go only through the functions below; members get no direct table access.
create table public.ruby_card_comments (
 id uuid primary key default gen_random_uuid(),
 card_id uuid not null references public.ruby_submissions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 parent_id uuid references public.ruby_card_comments(id) on delete set null,
 author_name text not null,
 body text not null check (length(trim(body)) between 1 and 1000),
 created_at timestamptz not null default now(),
 check (parent_id is distinct from id)
);
create index ruby_card_comments_card on public.ruby_card_comments(card_id, created_at desc);
create index ruby_card_comments_user on public.ruby_card_comments(user_id, created_at desc);
create index ruby_card_comments_parent on public.ruby_card_comments(parent_id) where parent_id is not null;
alter table public.ruby_card_comments enable row level security;
revoke all on table public.ruby_card_comments from public, anon, authenticated;

-- A lay the caller may see: exists, not hidden, and passes the ruby_submissions read policy check.
create function private.ruby_card_open(p_card uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists (select 1 from public.ruby_submissions s where s.id=p_card and coalesce(private.ruby_visible(s.user_id),false))
  and exists (select 1 from public.ruby_cards c where c.id=p_card and not c.hidden)
$$;
revoke all on function private.ruby_card_open(uuid) from public, anon, authenticated;

-- The latest 50 comments on a lay, newest first, without authors the caller cannot see.
create function public.ruby_card_comments(p_card uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(private.age_member_allowed(),false) then return null; end if;
 if not private.ruby_card_open(p_card) then return null; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'card_id',x.card_id,'user_id',x.user_id,
   'parent_id',x.parent_id,'author_name',x.author_name,'body',x.body,'created_at',x.created_at) order by x.created_at desc)
  from (select * from public.ruby_card_comments c where c.card_id=p_card
   and (coalesce(private.community_member_allowed(c.user_id),false) or coalesce(public.is_admin(),false))
   order by c.created_at desc limit 50) x), '[]'::jsonb);
end $$;
revoke all on function public.ruby_card_comments(uuid) from public, anon, authenticated;
grant execute on function public.ruby_card_comments(uuid) to authenticated;

-- Comment counts for up to 50 lays at once ({card id: count}); counts the comments the caller could read.
create function public.ruby_card_comment_counts(p_cards uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(private.age_member_allowed(),false) then return null; end if;
 if p_cards is null or cardinality(p_cards) > 50 then raise exception 'Too many cards'; end if;
 return coalesce((select jsonb_object_agg(k.id, (select count(*) from public.ruby_card_comments c where c.card_id=k.id
    and (coalesce(private.community_member_allowed(c.user_id),false) or coalesce(public.is_admin(),false))))
  from (select distinct unnest(p_cards) id) k where private.ruby_card_open(k.id)), '{}'::jsonb);
end $$;
revoke all on function public.ruby_card_comment_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.ruby_card_comment_counts(uuid[]) to authenticated;

create function public.add_ruby_card_comment(p_card uuid, p_body text, p_parent uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); username text; parent public.ruby_card_comments; saved public.ruby_card_comments;
begin
 if not private.community_reaction_actor_allowed() then raise exception 'Community posting unavailable'; end if;
 select p.username into username from public.community_profiles p where p.user_id=actor and p.visible
  and p.avatar is not null and p.username !~* '^Member_[a-f0-9]{8}$';
 if username is null then raise exception 'Complete and enable your community profile first'; end if;
 if p_body is null or length(trim(p_body)) not between 1 and 1000 then raise exception 'Write 1 to 1000 characters'; end if;
 if p_body ~* '(guaranteed (profit|returns|win)|risk[- ]free (bet|profit)|kill yourself|i will kill you|javascript:|<script)' then
  raise exception 'Remove harmful content, executable links or guaranteed-return claims'; end if;
 -- Same per-member lock and gap as post comments, across both kinds of comment.
 perform pg_advisory_xact_lock(hashtextextended(actor::text,420));
 if exists (select 1 from public.community_post_comments where user_id=actor and created_at>now()-interval '10 seconds')
  or exists (select 1 from public.ruby_card_comments where user_id=actor and created_at>now()-interval '10 seconds') then
  raise exception 'Wait ten seconds between comments'; end if;
 perform 1 from public.ruby_submissions where id=p_card for key share;
 if not found or not private.ruby_card_open(p_card) then raise exception 'Card unavailable'; end if;
 if p_parent is not null then
  select * into parent from public.ruby_card_comments where id=p_parent;
  if parent.id is null or parent.card_id<>p_card or not coalesce(private.community_member_allowed(parent.user_id),false) then
   raise exception 'Comment unavailable'; end if;
 end if;
 insert into public.ruby_card_comments(card_id, user_id, parent_id, author_name, body)
  values (p_card, actor, p_parent, username, trim(p_body)) returning * into saved;
 return jsonb_build_object('id',saved.id,'card_id',saved.card_id,'user_id',saved.user_id,'parent_id',saved.parent_id,
  'author_name',saved.author_name,'body',saved.body,'created_at',saved.created_at);
end $$;
revoke all on function public.add_ruby_card_comment(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.add_ruby_card_comment(uuid, text, uuid) to authenticated;

-- The author or an admin removes a comment; replies stay, detached (parent set null).
create function public.delete_ruby_card_comment(p_comment uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 delete from public.ruby_card_comments where id=p_comment and (user_id=auth.uid() or coalesce(public.is_admin(),false));
 if not found then raise exception 'Comment unavailable'; end if;
 return true;
end $$;
revoke all on function public.delete_ruby_card_comment(uuid) from public, anon, authenticated;
grant execute on function public.delete_ruby_card_comment(uuid) to authenticated;
