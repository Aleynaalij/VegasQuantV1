-- Explicit deny policies document that these are server-only records.
create policy no_client_access on private.billing_invoices for all to anon,authenticated using(false) with check(false);
create policy no_client_access on private.billing_subscriptions for all to anon,authenticated using(false) with check(false);
create policy no_client_access on private.feed_credentials for all to anon,authenticated using(false) with check(false);
create or replace function private.membership_status() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('allowed',private.has_membership(),'admin',private.is_admin(),'admin_account',exists(select 1 from private.admin_users where user_id=auth.uid()),'member_code',case when auth.uid() is not null then 'VQ-'||upper(substr(md5(auth.uid()::text),1,12)) else null end,'expires_at',greatest((select max(expires_at) from private.memberships where user_id=auth.uid() and revoked_at is null and starts_at<=now() and expires_at>now()),(select max(paid_until) from private.billing_subscriptions where user_id=auth.uid() and not blocked and paid_until>now())));
$$;
-- Feed facts also populate the private tapes; predictions and interpretations never do.
create function private.index_source_observation() returns trigger language plpgsql security definer set search_path='' as $$
declare o jsonb; opposite jsonb; mid uuid; m text; sel text; label text; begin
 if new.kind='odds' and new.observed_at is not null and new.observed_at<=now()+interval '5 minutes' then
  m=new.payload->>'market';
  if m not in ('h2h','spreads','totals','player_reception_yds') then return new; end if;
  for o in select value from jsonb_array_elements(new.payload->'outcomes') loop
   select value into opposite from jsonb_array_elements(new.payload->'outcomes') where value->>'name'<>o->>'name' and coalesce(value->>'description','')=coalesce(o->>'description','') and (m='h2h' or (m='spreads' and (value->>'point')::numeric=-(o->>'point')::numeric) or (m in ('totals','player_reception_yds') and value->>'point'=o->>'point')) limit 1;
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
create trigger index_source after insert on public.source_observations for each row execute function private.index_source_observation();

-- Index the facts fetched before this trigger was installed, without replacing history.
insert into public.intelligence_news(game_id,category,headline,body,observed_at,time_basis,source)
select s.game_id,case s.kind when 'news' then 'Team' when 'injury' then 'Injury' else 'Weather' end,
left(coalesce(s.payload->>'headline',nullif(concat_ws(' · ',s.payload->>'player',s.payload->>'status'),''),s.kind),300),s.payload::text,coalesce(s.observed_at,s.recorded_at),case when s.observed_at is null then 'received' else 'published' end,s.source
from public.source_observations s where s.kind in ('news','injury','weather') and not exists(select 1 from public.intelligence_news n where n.game_id=s.game_id and n.source=s.source and n.body=s.payload::text);
