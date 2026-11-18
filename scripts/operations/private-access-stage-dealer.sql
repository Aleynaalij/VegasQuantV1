-- This isolated source holds only operator-reviewed synthetic Dealer fixtures.
-- Its name and grants carry the fixture provenance. Display names and card tags
-- from the general discussion fixture do not establish Dealer authorship.
create table vq_private_access_stage.dealer_research (
  id uuid primary key,
  sport text not null check (sport in ('nba', 'nhl', 'nfl', 'ncaab')),
  title text not null check (char_length(title) between 1 and 160),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null
);
alter table vq_private_access_stage.dealer_research enable row level security;
revoke all on vq_private_access_stage.dealer_research from public, anon, authenticated, service_role;
grant select on vq_private_access_stage.dealer_research to authenticated;

create function vq_private_access_stage.dealer_research_allowed()
returns boolean
language sql stable security invoker set search_path = ''
as $$
  select vq_private_access_stage.authorized() is true
    and vq_fixture.allowed() is true
    and (public.age_verification_status() @> '{"synthetic": true, "verified": true}'::jsonb) is true
$$;
revoke all on function vq_private_access_stage.dealer_research_allowed() from public, anon, authenticated, service_role;
grant execute on function vq_private_access_stage.dealer_research_allowed() to authenticated;

create policy stage_dealer_read on vq_private_access_stage.dealer_research
  for select to authenticated using ((select vq_private_access_stage.dealer_research_allowed()));

create function public.vq_private_access_stage_dealer_feed(p_sport text, p_limit integer)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select case when
    p_sport in ('all', 'nba', 'nhl', 'nfl', 'ncaab') and p_limit between 1 and 3
    and vq_private_access_stage.dealer_research_allowed()
  then (
    select jsonb_build_object(
      'contract', 'vq-stage-dealer-v1',
      'posts', coalesce(jsonb_agg(
        jsonb_build_object(
          'id', post.id, 'sport', post.sport, 'title', post.title,
          'body', post.body, 'created_at', post.created_at
        ) order by post.created_at desc, post.id desc
      ), '[]'::jsonb)
    )
    from (
      select id, sport, title, body, created_at
      from vq_private_access_stage.dealer_research
      where p_sport = 'all' or sport = p_sport
      order by created_at desc, id desc
      limit p_limit
    ) post
  )
  end
$$;
revoke all on function public.vq_private_access_stage_dealer_feed(text, integer) from public, anon, authenticated, service_role;
grant execute on function public.vq_private_access_stage_dealer_feed(text, integer) to authenticated;
