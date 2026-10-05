-- Extend the existing immutable source index to rushing props. No picks or balances change.
create or replace function private.index_source_observation() returns trigger language plpgsql security definer set search_path='' as $$
declare o jsonb; opposite jsonb; mid uuid; m text; sel text; label text; begin
 if new.kind='odds' and new.observed_at is not null and new.observed_at<=now()+interval '5 minutes' then
  m=new.payload->>'market';
  if m not in ('h2h','spreads','totals','player_reception_yds','player_rush_yds') then return new; end if;
  for o in select value from jsonb_array_elements(new.payload->'outcomes') loop
   select value into opposite from jsonb_array_elements(new.payload->'outcomes') where value->>'name'<>o->>'name' and coalesce(value->>'description','')=coalesce(o->>'description','') and (m='h2h' or (m='spreads' and (value->>'point')::numeric=-(o->>'point')::numeric) or (m in ('totals','player_reception_yds','player_rush_yds') and value->>'point'=o->>'point')) limit 1;
   if opposite is null then continue; end if;
   sel=concat_ws(' ',nullif(o->>'description',''),o->>'name');
   label=sel||' · '||m;
   insert into public.intelligence_markets(game_id,market_key,label,market_type,selection,opposite,period,rules)
   values(new.game_id,'feed:'||m||':'||sel,label,case when m='h2h' then 'Moneyline' when m='spreads' then 'Side' when m='totals' then 'Total' else 'Player Prop' end,sel,concat_ws(' ',nullif(opposite->>'description',''),opposite->>'name'),'Full game','Provider quote; verify sportsbook settlement rules before comparison') on conflict(game_id,market_key) do nothing;
   select id into mid from public.intelligence_markets where game_id=new.game_id and market_key='feed:'||m||':'||sel;
   insert into public.intelligence_quotes(market_id,book,line,odds,opposite_odds,observed_at,time_basis,source,notes)
   values(mid,new.payload->>'book',(o->>'point')::numeric,(o->>'price')::numeric,(opposite->>'price')::numeric,new.observed_at,'observed',new.source,'Automated provider snapshot. Not an executable quote.');
  end loop;
 elsif new.kind in ('news','injury','weather') then
  insert into public.intelligence_news(game_id,category,headline,body,observed_at,time_basis,source)
  values(new.game_id,case new.kind when 'news' then 'Team' when 'injury' then 'Injury' else 'Weather' end,
  left(coalesce(new.payload->>'headline',nullif(concat_ws(' · ',new.payload->>'player',new.payload->>'status'),''),new.kind),300),
  new.payload::text,coalesce(new.observed_at,new.recorded_at),case when new.observed_at is null then 'received' else 'published' end,new.source);
 end if;
 return new;
end $$;
revoke all on function private.index_source_observation() from public,anon,authenticated;
