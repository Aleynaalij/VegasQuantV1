-- Member profiles, part 2 (owner request, Nov 9 2026): the owner edits their profile from their own page —
-- photo, tagline, bio, location (US state only) and Instagram/X links. No direct messages; no follower lists.
--  * New columns on community_profiles: tagline (<= 60), bio (<= 280), state (USPS code or ''). The old
--    region column and its check stay as they are (still used by the account settings page).
--  * Tagline and bio are trimmed and run through the same harmful-content / guaranteed-return pattern as
--    community posts and comments (private.community_safety_check).
--  * community_profile() also returns tagline, bio and state.

alter table public.community_profiles
 add column tagline text not null default '' check (length(tagline) <= 60),
 add column bio text not null default '' check (length(bio) <= 280),
 add column state text not null default '' check (state = any (array['',
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD',
  'TN','TX','UT','VT','VA','WA','WV','WI','WY']));

create function private.guard_community_profile_text() returns trigger
language plpgsql set search_path='' as $$
begin
 new.tagline := btrim(coalesce(new.tagline, ''));
 new.bio := btrim(coalesce(new.bio, ''));
 if (new.tagline || ' ' || new.bio) ~*
  '(guaranteed (profit|returns|win)|risk[- ]free (bet|profit)|kill yourself|i will kill you|javascript:|<script)' then
  raise exception 'Remove harmful content, executable links or guaranteed-return claims';
 end if;
 return new;
end $$;
revoke all on function private.guard_community_profile_text() from public, anon, authenticated;
create trigger guard_community_profile_text before insert or update of tagline, bio on public.community_profiles
 for each row execute function private.guard_community_profile_text();

create or replace function public.community_profile(p_username text, p_limit integer default 30) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 me uuid := auth.uid();
 p public.community_profiles;
 since timestamptz;
begin
 if me is null or not coalesce(private.age_member_allowed(), false) then return null; end if;
 select cp.* into p from public.community_profiles cp join auth.users u on u.id = cp.user_id
 where lower(cp.username) = lower(p_username)
  and (cp.user_id = me or cp.visible)
  and ((u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until <= now()))
       or private.is_dealer_publisher(u.id));
 if not found then return null; end if;
 if p.user_id <> me and not coalesce(private.community_member_allowed(p.user_id), false) then return null; end if;
 select created_at into since from auth.users where id = p.user_id;
 return jsonb_build_object(
  'user_id', p.user_id,
  'username', p.username,
  'avatar', p.avatar,
  'region', p.region,
  'tagline', p.tagline,
  'bio', p.bio,
  'state', p.state,
  'instagram_url', p.instagram_url,
  'x_url', p.x_url,
  'member_since', since,
  'is_me', p.user_id = me,
  'i_follow', exists (select 1 from public.member_follows f where f.user_id = me and f.target_user_id = p.user_id),
  'followers', (select count(*) from public.member_follows f where f.target_user_id = p.user_id),
  'following', (select count(*) from public.member_follows f where f.user_id = p.user_id),
  'post_count', (select count(*) from public.community_posts c where c.user_id = p.user_id),
  'posts', coalesce((
   select jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc) from (
    select c.id, c.sport, c.kind, c.title, c.body, c.legs, c.photo_path, c.card, c.created_at,
     (select count(*) from public.community_reactions r where r.post_id = c.id) as reactions,
     (select count(*) from public.community_post_comments k where k.post_id = c.id) as comments
    from public.community_posts c where c.user_id = p.user_id
    order by c.created_at desc, c.id desc limit greatest(1, least(coalesce(p_limit, 30), 60))
   ) x), '[]'::jsonb)
 );
end $$;
revoke all on function public.community_profile(text, integer) from public, anon, authenticated;
grant execute on function public.community_profile(text, integer) to authenticated;
