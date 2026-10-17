-- User-created private combinations have no product leg-count cap.
-- Research-board and editorial publication rules are separate and unchanged.
alter table public.member_parlays drop constraint member_parlays_leg_keys_check;
alter table public.member_parlays add constraint member_parlays_leg_keys_check check (cardinality(leg_keys)>=2);
alter table public.member_parlays drop constraint member_parlays_legs_check;
alter table public.member_parlays add constraint member_parlays_legs_check check (jsonb_typeof(legs)='array' and jsonb_array_length(legs)>=2);
do $$
declare definition text;
begin
  definition:=pg_get_functiondef('private.create_member_parlay(text,text[])'::regprocedure);
  if position('cardinality(p_leg_keys) not between 2 and 7' in definition)=0 then
    raise exception 'Unexpected member parlay limit; review deployed function';
  end if;
  definition:=replace(definition,'cardinality(p_leg_keys) not between 2 and 7','cardinality(p_leg_keys)<2');
  definition:=replace(definition,'Choose two to seven published legs','Choose at least two published legs');
  execute definition;
end $$;
