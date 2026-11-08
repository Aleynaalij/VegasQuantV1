-- Zone polls (owner request, Nov 8 2026): a post can carry one poll (a question with 2-4 options).
-- Members vote once per poll and may change their vote; everyone who can read the post sees the
-- counts, never who voted for what.
--  * Polls are created only together with their post, atomically, by public.create_community_poll_post
--    (security invoker), so the post insert keeps every existing guard: RLS, profile, rate and safety
--    triggers. A poll can't be attached to someone else's post or added later.
--  * Votes go through private.set_community_poll_vote (security definer, actor = auth.uid()), using the
--    same member rules as typed reactions (private.community_reaction_actor_allowed).
--  * Deleting a post deletes its poll and votes; deleting an account deletes that member's votes.

create table public.community_polls(
 post_id uuid primary key references public.community_posts(id) on delete cascade,
 question text not null check (length(btrim(question)) between 1 and 140),
 options jsonb not null check (
  jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 4),
 created_at timestamptz not null default now()
);
alter table public.community_polls enable row level security;
create policy community_polls_read on public.community_polls for select to authenticated
 using (exists (select 1 from public.community_posts p where p.id = post_id
  and (private.community_member_allowed(p.user_id) or (select public.is_admin()))));
create policy community_polls_insert on public.community_polls for insert to authenticated
 with check (exists (select 1 from public.community_posts p where p.id = post_id
  and p.user_id = (select auth.uid()) and p.created_at > now() - interval '1 minute'));
grant select, insert on public.community_polls to authenticated;

-- Option text is validated here, not only by the client: 1-60 characters each, no duplicates.
create function private.guard_community_poll() returns trigger
language plpgsql set search_path='' as $$
declare o jsonb; seen text[] := '{}'; t text;
begin
 new.question := btrim(new.question);
 for o in select value from jsonb_array_elements(new.options) loop
  if jsonb_typeof(o) <> 'string' then raise exception 'Poll options must be text'; end if;
  t := btrim(o #>> '{}');
  if length(t) not between 1 and 60 then raise exception 'Poll options must be 1-60 characters'; end if;
  if lower(t) = any(seen) then raise exception 'Poll options must be different'; end if;
  seen := seen || lower(t);
 end loop;
 new.options := (select jsonb_agg(btrim(value #>> '{}')) from jsonb_array_elements(new.options));
 return new;
end $$;
revoke all on function private.guard_community_poll() from public, anon, authenticated;
create trigger guard_community_poll before insert on public.community_polls
 for each row execute function private.guard_community_poll();

create table public.community_poll_votes(
 post_id uuid not null references public.community_polls(post_id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 option_index smallint not null check (option_index between 0 and 3),
 created_at timestamptz not null default now(),
 primary key (post_id, user_id)
);
alter table public.community_poll_votes enable row level security;
-- No direct access: counts come from community_poll_states, writes from set_community_poll_vote.
revoke all on public.community_poll_votes from public, anon, authenticated;

-- One post plus its poll in a single transaction. Security invoker: the caller's RLS and the post
-- triggers apply exactly as for a direct insert.
create function public.create_community_poll_post(p_id uuid, p_sport text, p_body text,
 p_photo_path text, p_question text, p_options jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
begin
 insert into public.community_posts(id, user_id, sport, kind, title, body, legs, stake, photo_path)
 values (p_id, auth.uid(), p_sport, 'talk', 'Community poll', coalesce(nullif(btrim(p_body), ''), btrim(p_question)),
  '[]'::jsonb, null, p_photo_path);
 insert into public.community_polls(post_id, question, options) values (p_id, p_question, p_options);
 return p_id;
end $$;
revoke all on function public.create_community_poll_post(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_community_poll_post(uuid, text, text, text, text, jsonb) to authenticated;

-- Poll states for up to 100 posts the caller can read: question, options, counts, total and the
-- caller's own choice. Posts without a poll are simply absent.
create function public.community_poll_states(p_posts uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(private.age_member_allowed(), false) then return '[]'::jsonb; end if;
 if coalesce(cardinality(p_posts), 0) > 100 then raise exception 'Too many posts'; end if;
 return coalesce((
  select jsonb_agg(jsonb_build_object(
   'post_id', pl.post_id, 'question', pl.question, 'options', pl.options,
   'counts', (select jsonb_agg((select count(*) from public.community_poll_votes v
                 where v.post_id = pl.post_id and v.option_index = i.n) order by i.n)
              from generate_series(0, jsonb_array_length(pl.options) - 1) as i(n)),
   'total', (select count(*) from public.community_poll_votes v where v.post_id = pl.post_id),
   'mine', (select v.option_index from public.community_poll_votes v
            where v.post_id = pl.post_id and v.user_id = auth.uid())))
  from public.community_polls pl join public.community_posts p on p.id = pl.post_id
  where pl.post_id = any(p_posts)
   and (private.community_member_allowed(p.user_id) or public.is_admin())), '[]'::jsonb);
end $$;
revoke all on function public.community_poll_states(uuid[]) from public, anon, authenticated;
grant execute on function public.community_poll_states(uuid[]) to authenticated;

-- Vote, change a vote, or clear it (p_option null). No actor parameter.
create function private.set_community_poll_vote(p_post uuid, p_option integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); author uuid; n integer;
begin
 if not private.community_reaction_actor_allowed() then raise exception 'Community vote unavailable'; end if;
 select p.user_id, jsonb_array_length(pl.options) into author, n
  from public.community_polls pl join public.community_posts p on p.id = pl.post_id
  where pl.post_id = p_post for key share of pl;
 if author is null or not coalesce(private.community_member_allowed(author), false) then
  raise exception 'Poll unavailable'; end if;
 if p_option is not null and (p_option < 0 or p_option >= n) then raise exception 'Unknown poll option'; end if;
 if p_option is null then
  delete from public.community_poll_votes where post_id = p_post and user_id = actor;
 else
  insert into public.community_poll_votes(post_id, user_id, option_index) values (p_post, actor, p_option)
  on conflict (post_id, user_id) do update set option_index = excluded.option_index, created_at = now();
 end if;
 return (select value from jsonb_array_elements(public.community_poll_states(array[p_post])) limit 1);
end $$;
revoke all on function private.set_community_poll_vote(uuid, integer) from public, anon, authenticated;
grant execute on function private.set_community_poll_vote(uuid, integer) to authenticated;
create function public.set_community_poll_vote(p_post uuid, p_option integer) returns jsonb
language sql security invoker set search_path='' as $$ select private.set_community_poll_vote(p_post, p_option) $$;
revoke all on function public.set_community_poll_vote(uuid, integer) from public, anon, authenticated;
grant execute on function public.set_community_poll_vote(uuid, integer) to authenticated;
