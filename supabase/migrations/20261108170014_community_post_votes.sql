-- Reddit-style votes on Zone posts (owner request, Nov 8 2026): each member can up-vote or down-vote a
-- post once, change it, or take it back. Everyone who can read the post sees its score (ups minus
-- downs); nobody sees who voted which way.
--  * Votes go through private.set_community_post_vote (security definer, actor = auth.uid()), behind the
--    same member gate as typed reactions (private.community_reaction_actor_allowed).
--  * Scores are read in one batch per feed load with public.community_vote_states(uuid[]).
--  * Deleting a post deletes its votes; deleting an account deletes that member's votes.

create table public.community_post_votes(
 post_id uuid not null references public.community_posts(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 value smallint not null check (value in (-1, 1)),
 created_at timestamptz not null default now(),
 primary key (post_id, user_id)
);
create index community_post_votes_post on public.community_post_votes(post_id);
alter table public.community_post_votes enable row level security;
-- No direct access for client roles: scores come from community_vote_states, writes from the RPC.
revoke all on public.community_post_votes from public, anon, authenticated;

-- Score, ups, downs and the caller's own vote (-1, 1 or null) for up to 100 readable posts. Every
-- requested readable post is returned, with zeros when it has no votes.
create function public.community_vote_states(p_posts uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(private.age_member_allowed(), false) then return '[]'::jsonb; end if;
 if coalesce(cardinality(p_posts), 0) > 100 then raise exception 'Too many posts'; end if;
 return coalesce((
  select jsonb_agg(jsonb_build_object(
   'post_id', p.id,
   'up', coalesce(v.up, 0), 'down', coalesce(v.down, 0), 'score', coalesce(v.up, 0) - coalesce(v.down, 0),
   'mine', v.mine))
  from public.community_posts p
  left join lateral (
   select count(*) filter (where value = 1) up, count(*) filter (where value = -1) down,
    max(value) filter (where user_id = auth.uid()) mine
   from public.community_post_votes where post_id = p.id) v on true
  where p.id = any(p_posts)
   and (private.community_member_allowed(p.user_id) or public.is_admin())), '[]'::jsonb);
end $$;
revoke all on function public.community_vote_states(uuid[]) from public, anon, authenticated;
grant execute on function public.community_vote_states(uuid[]) to authenticated;

-- Up-vote (1), down-vote (-1) or clear (0 or null). No actor parameter.
create function private.set_community_post_vote(p_post uuid, p_value integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); author uuid;
begin
 if not private.community_reaction_actor_allowed() then raise exception 'Community vote unavailable'; end if;
 if p_value is not null and p_value not in (-1, 0, 1) then raise exception 'Unsupported vote'; end if;
 select user_id into author from public.community_posts where id = p_post for key share;
 if author is null or not coalesce(private.community_member_allowed(author), false) then
  raise exception 'Post unavailable'; end if;
 if coalesce(p_value, 0) = 0 then
  delete from public.community_post_votes where post_id = p_post and user_id = actor;
 else
  insert into public.community_post_votes(post_id, user_id, value) values (p_post, actor, p_value)
  on conflict (post_id, user_id) do update set value = excluded.value, created_at = now();
 end if;
 return (select value from jsonb_array_elements(public.community_vote_states(array[p_post])) limit 1);
end $$;
revoke all on function private.set_community_post_vote(uuid, integer) from public, anon, authenticated;
grant execute on function private.set_community_post_vote(uuid, integer) to authenticated;
create function public.set_community_post_vote(p_post uuid, p_value integer) returns jsonb
language sql security invoker set search_path='' as $$ select private.set_community_post_vote(p_post, p_value) $$;
revoke all on function public.set_community_post_vote(uuid, integer) from public, anon, authenticated;
grant execute on function public.set_community_post_vote(uuid, integer) to authenticated;
