alter table public.pick_results alter column away_score drop not null, alter column home_score drop not null;
alter table public.pick_entries alter column bet_at drop not null;
comment on column public.pick_entries.bet_at is 'Actual placement time when supplied; null when owner confirms execution without an exact time.';
