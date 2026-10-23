-- Preserve a curated card when its verifier later erases their account.
-- The author/card erasure cascade remains separate and unchanged.
alter table public.ruby_daily_features alter column verified_by drop not null;
alter table public.ruby_daily_features drop constraint ruby_daily_features_verified_by_fkey;
alter table public.ruby_daily_features add constraint ruby_daily_features_verified_by_fkey foreign key(verified_by) references auth.users(id) on delete set null;
