-- Member-created combinations only. Editorial publishing limits are unchanged.
alter table public.member_parlays drop constraint member_parlays_leg_keys_check;
alter table public.member_parlays add constraint member_parlays_leg_keys_check
  check (cardinality(leg_keys) between 2 and 7);
alter table public.member_parlays drop constraint member_parlays_legs_check;
alter table public.member_parlays add constraint member_parlays_legs_check
  check (jsonb_typeof(legs)='array' and jsonb_array_length(legs) between 2 and 7);

-- Preserve the deployed ownership, membership, source-snapshot and conflict checks.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('private.create_member_parlay(text,text[])'::regprocedure);
  if position('cardinality(p_leg_keys) not between 2 and 4' in definition)=0 then
    raise exception 'Unexpected member parlay limit; review the deployed function';
  end if;
  definition := replace(definition,'cardinality(p_leg_keys) not between 2 and 4','cardinality(p_leg_keys) not between 2 and 7');
  definition := replace(definition,'Choose two to four published legs','Choose two to seven published legs');
  execute definition;
end $$;
