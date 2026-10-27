alter table public.official_picks add column gambly_url text
check (gambly_url is null or (length(gambly_url)<=2048 and gambly_url ~ '^https://(www\.)?gambly\.com(/[^[:space:]]*)?$'));
do $migration$
declare definition text; updated text;
begin
definition := pg_get_functiondef('private.publish(text,jsonb,uuid)'::regprocedure);
updated := replace(definition,'market_info_url,known_at_publication)','market_info_url,gambly_url,known_at_publication)');
updated := replace(updated,'nullif(p_payload->>''market_info_url'',''''),jsonb_build_object','nullif(p_payload->>''market_info_url'',''''),nullif(p_payload->>''gambly_url'',''''),jsonb_build_object');
if updated=definition or position('nullif(p_payload->>''gambly_url'','''')' in updated)=0 then raise exception 'Publisher definition changed'; end if;
execute updated;
definition := pg_get_functiondef('private.free_challenge_desk()'::regprocedure);
updated := replace(definition,'created_at,market_info_url from public.official_picks','created_at,market_info_url,gambly_url from public.official_picks');
if updated=definition then raise exception 'Free desk definition changed'; end if;
execute updated;
end;
$migration$;
