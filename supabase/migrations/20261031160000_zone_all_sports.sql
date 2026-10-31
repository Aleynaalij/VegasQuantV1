-- One Zone across every sport (owner, Oct 31 2026, #166): NHL and college basketball posts and contributor lays
-- join the same feed as NFL and NBA. Additive only: existing rows keep their sport.
--  * community_posts.sport accepts nhl and ncaab (canonical app keys).
--  * NBA is live again, so NBA posts are no longer limited to talk posts (the preseason nba_preparation_posts rule).
--  * Contributor lays store upper-case names; NCAAB joins the list (NHL was already allowed).
alter table public.community_posts drop constraint community_posts_sport_check;
alter table public.community_posts add constraint community_posts_sport_check check (sport in ('nfl', 'nba', 'nhl', 'ncaab'));
alter table public.community_posts drop constraint nba_preparation_posts;

alter table public.ruby_submissions drop constraint ruby_submissions_sport_check;
alter table public.ruby_submissions add constraint ruby_submissions_sport_check check (sport in ('Soccer', 'NFL', 'NHL', 'NBA', 'NCAAB', 'Baseball', 'WNBA'));
alter table public.ruby_card_revisions drop constraint ruby_card_revisions_sport_check;
alter table public.ruby_card_revisions add constraint ruby_card_revisions_sport_check check (sport in ('Soccer', 'NFL', 'NHL', 'NBA', 'NCAAB', 'Baseball', 'WNBA'));
