-- Exact reviewed information pages only. Existing immutable-pick triggers apply.
alter table public.official_picks add column market_info_url text
check (market_info_url is null or market_info_url in (
 'https://www.espn.com/nfl/odds',
 'https://www.scoresandodds.com/nfl/odds',
 'https://www.covers.com/sport/football/nfl/odds'
));
-- Retain all existing publishing, authorization and idempotency guards.
do $migration$
declare definition text; updated text;
begin
 definition := pg_get_functiondef('private.publish(text,jsonb,uuid)'::regprocedure);
 updated := replace(definition, 'book,raw_handoff,known_at_publication)', 'book,raw_handoff,market_info_url,known_at_publication)');
 updated := replace(updated, 'p_payload->>''book'',p_payload->>''raw_handoff'',jsonb_build_object', 'p_payload->>''book'',p_payload->>''raw_handoff'',nullif(p_payload->>''market_info_url'',''''),jsonb_build_object');
 if updated = definition or position('nullif(p_payload->>''market_info_url'','''')' in updated)=0 then
  raise exception 'Publishing function changed; review migration before applying';
 end if;
 execute updated;
end;
$migration$;
