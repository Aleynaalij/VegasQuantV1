-- Original owner brief allows either a single or a parlay at +100 or better.
-- Singles use the exact existing individual quote; no invented complete parlay price.
alter table public.nfl_analyst_double_ups drop constraint nfl_analyst_double_ups_candidates_check;
alter table public.nfl_analyst_double_ups add constraint nfl_analyst_double_ups_candidates_check
 check(jsonb_typeof(candidates)='array' and jsonb_array_length(candidates) in (1,3,4));
do $$declare definition text; changed text;begin
 definition:=pg_get_functiondef('private.publish_analyst_double_up(jsonb)'::regprocedure);
 changed:=replace(definition,'jsonb_array_length(p->''candidates'') not between 3 and 4','jsonb_array_length(p->''candidates'') not in (1,3,4)');
 changed:=replace(changed,'Three or four supported pregame legs required; never force a count','One supported single or three/four supported parlay legs required; never force a count');
 changed:=replace(changed,$old$ if q.id is null or q.kind<>'odds' or q.payload->>'market' is distinct from 'parlay'$old$,$new$ if jsonb_array_length(p->'candidates')=1 then
  if q.id is null or q.id::text is distinct from p#>>'{candidates,0,selection_gate,quote_observation_id}'
   or private.nfl_gate_number(p->'combined_odds') is distinct from private.nfl_gate_number(p#>'{candidates,0,odds}')
   or q.recorded_at>cutoff or observed is null or observed>generated or observed<now()-interval '15 minutes'
  then raise exception 'A single must use its own exact immutable quote and price';end if;
 elsif q.id is null or q.kind<>'odds' or q.payload->>'market' is distinct from 'parlay'$new$);
 if changed=definition or strpos(changed,'A single must use its own exact immutable quote and price')=0
  or strpos(changed,'not in (1,3,4)')=0 then raise exception 'Publisher changed; review single support';end if;
 execute changed;
end $$;
