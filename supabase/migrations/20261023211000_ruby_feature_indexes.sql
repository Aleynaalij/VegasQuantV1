-- Cover feature foreign keys for immutable history and account erasure checks.
create index ruby_feature_submission on public.ruby_daily_features(submission_id);
create index ruby_feature_verifier on public.ruby_daily_features(verified_by);
