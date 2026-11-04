-- Reactions on VIP contributor lays (ruby_cards view over ruby_submissions), so every Zone item can take a Like or an emoji.
-- Same contract as community post reactions (#206): one reaction per member per card, Like is
-- 'heart', alternatives celebrate/fire/thinking, version-1 state with canonical counts.
-- Reads and writes go only through the two functions below; members get no direct table access.
create table public.ruby_card_reactions (
 card_id uuid not null references public.ruby_submissions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 reaction_type text not null default 'heart' check (reaction_type in ('heart','celebrate','fire','thinking')),
 created_at timestamptz not null default now(),
 primary key (card_id, user_id)
);
alter table public.ruby_card_reactions enable row level security;
revoke all on table public.ruby_card_reactions from public, anon, authenticated;

-- The existing per-member reaction/follow rate limit (60 a minute) covers card reactions too.
create trigger ruby_card_reaction_rate before insert on public.ruby_card_reactions
 for each row execute function private.notification_interaction_guard();

-- Canonical state for up to 50 cards: counts are aggregates (no reactor identities), plus the
-- caller's own choice. Hidden, missing or not-visible cards (the same ruby_visible check as the
-- ruby_submissions read policy: blocks either way, restricted contributor) return no entry. Signed-in, age-eligible only.
create function public.ruby_card_reaction_states(p_cards uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(private.age_member_allowed(),false) then return null; end if;
 if p_cards is null or cardinality(p_cards) > 50 then raise exception 'Too many cards'; end if;
 return coalesce((select jsonb_agg(x.state) from (
  select jsonb_build_object('version',1,'post_id',c.id,'total',count(r.user_id),
   'counts',jsonb_build_object('heart',count(*) filter (where r.reaction_type='heart'),
    'celebrate',count(*) filter (where r.reaction_type='celebrate'),
    'fire',count(*) filter (where r.reaction_type='fire'),
    'thinking',count(*) filter (where r.reaction_type='thinking')),
   'mine',max(r.reaction_type) filter (where r.user_id=auth.uid())) state
  from public.ruby_cards c
  left join public.ruby_card_reactions r on r.card_id=c.id
  where c.id = any(p_cards) and not c.hidden and private.ruby_visible(c.user_id)
  group by c.id) x), '[]'::jsonb);
end $$;
revoke all on function public.ruby_card_reaction_states(uuid[]) from public, anon, authenticated;
grant execute on function public.ruby_card_reaction_states(uuid[]) to authenticated;

-- Set the caller's reaction (null removes). Same eligibility gate as post reactions; explicit
-- desired state, atomic replace under a per-member/card lock; returns the canonical state.
create function public.set_ruby_card_reaction(p_card uuid, p_reaction text default 'heart') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); author uuid; previous text;
begin
 if not private.community_reaction_actor_allowed() then raise exception 'Reaction unavailable'; end if;
 if p_reaction is not null and p_reaction not in ('heart','celebrate','fire','thinking') then
  raise exception 'Unsupported reaction'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ruby-card-reaction:'||actor::text||':'||p_card::text, 0));
 -- Lock the underlying lay (ruby_cards is a view) and refuse missing, hidden or not-visible cards
 -- (this definer bypasses the ruby_submissions read policy, so its ruby_visible check is repeated).
 select user_id into author from public.ruby_submissions where id=p_card for key share;
 if author is null or not coalesce(private.ruby_visible(author),false)
  or not exists (select 1 from public.ruby_cards where id=p_card and not hidden) then
  raise exception 'Card unavailable'; end if;
 select reaction_type into previous from public.ruby_card_reactions where card_id=p_card and user_id=actor for update;
 if previous is distinct from p_reaction then
  delete from public.ruby_card_reactions where card_id=p_card and user_id=actor;
  if p_reaction is not null then
   insert into public.ruby_card_reactions(card_id, user_id, reaction_type) values (p_card, actor, p_reaction);
  end if;
 end if;
 return (public.ruby_card_reaction_states(array[p_card]))->0;
end $$;
revoke all on function public.set_ruby_card_reaction(uuid, text) from public, anon, authenticated;
grant execute on function public.set_ruby_card_reaction(uuid, text) to authenticated;
