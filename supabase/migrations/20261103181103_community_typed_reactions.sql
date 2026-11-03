-- DRAFT ONLY. One actor/post; existing identity-only writes remain hearts.
alter table public.community_reactions add column reaction_type text not null default 'heart'
 check (reaction_type in ('heart','celebrate','fire','thinking'));

-- This is deliberately no weaker than the existing community write boundary.
create function private.community_reaction_actor_allowed() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and coalesce(private.age_member_allowed(),false)
 and exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null
  and (banned_until is null or banned_until<=now()))
 and not exists(select 1 from private.community_restrictions where user_id=auth.uid())
 and not exists(select 1 from private.account_erasure_jobs where user_id=auth.uid() and expires_at>now())
$$;
revoke all on function private.community_reaction_actor_allowed() from public,anon,authenticated;

-- Covers old direct inserts too, rather than relying on the new client to call the RPC.
create function private.guard_community_typed_reaction() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.user_id is distinct from auth.uid() or not private.community_reaction_actor_allowed() then
  raise exception 'Community reaction unavailable';
 end if;
 return new;
end $$;
revoke all on function private.guard_community_typed_reaction() from public,anon,authenticated;
create trigger a_guard_community_typed_reaction before insert on public.community_reactions
 for each row execute function private.guard_community_typed_reaction();

-- Existing heart notification semantics/dedupe stay unchanged. Emoji changes are silent;
-- they must not generate a false "liked" message or introduce new delivery consent.
drop trigger notification_like on public.community_reactions;
create trigger notification_like after insert on public.community_reactions
 for each row when (new.reaction_type='heart') execute function private.notification_social_event();

create function public.community_reaction_state(p_post uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(private.age_member_allowed(),false) then return null;end if;
 if not exists(select 1 from public.community_posts p where p.id=p_post
  and private.community_member_allowed(p.user_id)) then return null;end if;
 return (select jsonb_build_object('version',1,'post_id',p_post,'total',count(*),
  'counts',jsonb_build_object('heart',count(*) filter(where reaction_type='heart'),
   'celebrate',count(*) filter(where reaction_type='celebrate'),
   'fire',count(*) filter(where reaction_type='fire'),
   'thinking',count(*) filter(where reaction_type='thinking')),
  'mine',max(reaction_type) filter(where user_id=auth.uid()))
  from public.community_reactions where post_id=p_post);
end $$;
revoke all on function public.community_reaction_state(uuid) from public,anon,authenticated;
grant execute on function public.community_reaction_state(uuid) to authenticated;

-- Private definer needed only for atomic replacement without granting table UPDATE.
-- No actor parameter; all targets explicitly checked before bypassing table RLS.
create function private.set_community_reaction(p_post uuid,p_reaction text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target uuid; previous text;
begin
 if not private.community_reaction_actor_allowed() then raise exception 'Community reaction unavailable';end if;
 if p_reaction is not null and p_reaction not in ('heart','celebrate','fire','thinking') then
  raise exception 'Unsupported reaction';end if;
 perform pg_advisory_xact_lock(hashtextextended('community-reaction:'||actor::text||':'||p_post::text,0));
 select user_id into target from public.community_posts where id=p_post for key share;
 if target is null or not coalesce(private.community_member_allowed(target),false) then
  raise exception 'Post unavailable';end if;
 select reaction_type into previous from public.community_reactions where post_id=p_post and user_id=actor for update;
 if previous is distinct from p_reaction then
  delete from public.community_reactions where post_id=p_post and user_id=actor;
  if p_reaction is not null then
   -- Original safety, rate and notification triggers still run. Any error rolls back
   -- this entire function call, including the deleted previous selection.
   insert into public.community_reactions(post_id,user_id,reaction_type) values(p_post,actor,p_reaction);
  end if;
 end if;
 return public.community_reaction_state(p_post);
end $$;
revoke all on function private.set_community_reaction(uuid,text) from public,anon,authenticated;
grant execute on function private.set_community_reaction(uuid,text) to authenticated;
create function public.set_community_reaction(p_post uuid,p_reaction text default 'heart') returns jsonb
language sql security invoker set search_path='' as $$select private.set_community_reaction(p_post,p_reaction)$$;
revoke all on function public.set_community_reaction(uuid,text) from public,anon,authenticated;
grant execute on function public.set_community_reaction(uuid,text) to authenticated;
