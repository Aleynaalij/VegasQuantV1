create or replace function private.publish(p_action text,p_payload jsonb,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.official_picks; g public.games; ch public.challenges; st public.challenge_stages; av public.analysis_versions; ent public.pick_entries; result_id uuid; entity_id uuid; v integer; gain integer; new_balance integer; receipt jsonb; k text; required_field text; kickoff timestamptz;
begin
 if not private.is_admin() then raise exception 'Admin access required'; end if;
 if octet_length(p_payload::text)>150000 then raise exception 'Publication exceeds 150 KB'; end if;
 perform pg_advisory_xact_lock(hashtext(p_request_id::text));
 select response into receipt from private.publish_receipts where request_id=p_request_id;
 if found then return receipt; end if;
 if p_action in ('market','entry','close','result') and coalesce(trim(p_payload->>'source'),'')='' then raise exception 'A source is required'; end if;
 if p_action='game' then
  if exists(select 1 from public.official_picks where game_id=(p_payload->>'id')::uuid) then raise exception 'Game details are locked once an official pick is published'; end if;
  if exists(select 1 from public.games where id=(p_payload->>'id')::uuid and kickoff<=now()) then raise exception 'A started game cannot be rewritten. Publish a correction in analysis history.'; end if;
  foreach required_field in array array['slug','away_team','home_team','kickoff','venue','slot'] loop
   if coalesce(trim(p_payload->>required_field),'')='' then raise exception 'Missing game field: %',required_field; end if;
  end loop;
  insert into public.games(id,slug,away_team,home_team,kickoff,venue,slot) values(coalesce((p_payload->>'id')::uuid,gen_random_uuid()),p_payload->>'slug',p_payload->>'away_team',p_payload->>'home_team',(p_payload->>'kickoff')::timestamptz,p_payload->>'venue',p_payload->>'slot') on conflict(id) do update set slug=excluded.slug,away_team=excluded.away_team,home_team=excluded.home_team,kickoff=excluded.kickoff,venue=excluded.venue,slot=excluded.slot returning id into entity_id;
  if nullif(p_payload->>'stage_id','') is not null then
   select * into st from public.challenge_stages where id=(p_payload->>'stage_id')::uuid for update;
   if not found then raise exception 'Stage not found'; end if;
   if exists(select 1 from public.official_picks where stage_id=st.id) then raise exception 'Cannot replace a matchup with an official pick'; end if;
   update public.challenge_stages set game_id=entity_id,status='ANALYSIS IN PROGRESS' where id=st.id;
  end if;
 elsif p_action='market' then
  if (p_payload->>'observed_at')::timestamptz>now()+interval '5 minutes' then raise exception 'Market timestamp cannot be in the future'; end if;
  insert into public.market_snapshots(game_id,observed_at,source,spread,moneyline,total,kind,notes) values((p_payload->>'game_id')::uuid,(p_payload->>'observed_at')::timestamptz,p_payload->>'source',p_payload->>'spread',p_payload->>'moneyline',p_payload->>'total',p_payload->>'kind',p_payload->>'notes') returning id into entity_id;
 elsif p_action='analysis' then
  perform 1 from public.games where id=(p_payload->>'game_id')::uuid for update;
  if not found then raise exception 'Game not found'; end if;
  select coalesce(max(version),0)+1 into v from public.analysis_versions where game_id=(p_payload->>'game_id')::uuid;
  insert into public.analysis_versions(game_id,version,title,sections,projections,raw_handoff,source) values((p_payload->>'game_id')::uuid,v,p_payload->>'title',coalesce(p_payload->'sections','{}'),coalesce(p_payload->'projections','{}'),p_payload->>'raw_handoff',coalesce(p_payload->>'source','Vegas Quant Ultra / owner handoff')) returning id into entity_id;
 elsif p_action='pick' then
  select * into g from public.games where id=(p_payload->>'game_id')::uuid for update;
  if not found or g.kickoff<=now() then raise exception 'Official recommendations must be published before kickoff'; end if;
  select * into av from public.analysis_versions where id=(p_payload->>'analysis_id')::uuid and game_id=g.id;
  if not found then raise exception 'Select a published analysis version for this game'; end if;
  foreach required_field in array array['selection','predicted_close','best_number','bet_grade','timing','why_like','why_lose','playable_number','pass_number','book','raw_handoff'] loop
   if coalesce(trim(p_payload->>required_field),'')='' then raise exception 'Missing required analyst field: %',required_field; end if;
  end loop;
  if nullif(p_payload->>'stage_id','') is not null then
   select * into st from public.challenge_stages where id=(p_payload->>'stage_id')::uuid;
   select * into ch from public.challenges where id=st.challenge_id for update;
   if st.game_id is distinct from g.id or st.stage_number<>ch.current_stage then raise exception 'Pick must match the current challenge stage'; end if;
   if ch.status in ('PASS / PAUSED','LOST','COMPLETED','OFFICIAL PLAY') then raise exception 'Challenge is paused, closed, or has an open pick'; end if;
   if (p_payload->>'stake_cents')::integer>ch.balance_cents then raise exception 'Stake exceeds challenge bankroll'; end if;
  end if;
  insert into public.official_picks(game_id,stage_id,analysis_id,market,selection,recommended_line,direction,odds,stake_cents,model_probability,market_probability,edge,confidence,risk,predicted_close,best_number,bet_grade,fear_index,timing,why_like,why_lose,playable_number,pass_number,book,raw_handoff,known_at_publication)
  values(g.id,st.id,av.id,p_payload->>'market',p_payload->>'selection',(p_payload->>'recommended_line')::numeric,nullif(p_payload->>'direction',''),(p_payload->>'odds')::numeric,(p_payload->>'stake_cents')::integer,(p_payload->>'model_probability')::numeric,(p_payload->>'market_probability')::numeric,(p_payload->>'edge')::numeric,(p_payload->>'confidence')::numeric,(p_payload->>'risk')::numeric,p_payload->>'predicted_close',p_payload->>'best_number',p_payload->>'bet_grade',(p_payload->>'fear_index')::numeric,p_payload->>'timing',p_payload->>'why_like',p_payload->>'why_lose',p_payload->>'playable_number',p_payload->>'pass_number',p_payload->>'book',p_payload->>'raw_handoff',jsonb_build_object('game',to_jsonb(g),'analysis',to_jsonb(av),'markets',(select coalesce(jsonb_agg(m order by observed_at desc),'[]') from public.market_snapshots m where m.game_id=g.id))) returning id into entity_id;
  if st.id is not null then
   update public.challenge_stages set status='OFFICIAL PLAY' where id=st.id;
   update public.challenges set status='OFFICIAL PLAY' where id=ch.id;
   insert into public.bankroll_transactions(challenge_id,pick_id,kind,amount_cents,balance_cents) values(ch.id,entity_id,'RESERVE',0,ch.balance_cents);
  end if;
 elsif p_action in ('entry','close','result','review') then
  select * into p from public.official_picks where id=(p_payload->>'pick_id')::uuid for update;
  if not found then raise exception 'Official pick not found'; end if;
  select games.kickoff into kickoff from public.games where id=p.game_id;
  if p_action='entry' then
   if (p_payload->>'bet_at')::timestamptz>=kickoff or (p_payload->>'bet_at')::timestamptz>now()+interval '5 minutes' then raise exception 'Actual bet time must precede kickoff and cannot be future-dated'; end if;
   if exists(select 1 from public.pick_results where pick_id=p.id) then raise exception 'Cannot add an entry after settlement'; end if;
   if p.market<>'Moneyline' and (p_payload->>'line') is null then raise exception 'Actual line required'; end if;
   if p.market='Moneyline' and (p_payload->>'line') is not null then raise exception 'Moneyline has no spread or total line'; end if;
   insert into public.pick_entries(pick_id,line,odds,source,bet_at) values(p.id,(p_payload->>'line')::numeric,(p_payload->>'odds')::numeric,p_payload->>'source',(p_payload->>'bet_at')::timestamptz) returning id into entity_id;
  elsif p_action='close' then
   if now()<kickoff then raise exception 'Record the close after kickoff'; end if;
   if (p_payload->>'observed_at')::timestamptz>kickoff or (p_payload->>'observed_at')::timestamptz<kickoff-interval '1 hour' then raise exception 'Closing timestamp must be within the hour before kickoff'; end if;
   if p.market<>'Moneyline' and (p_payload->>'line') is null then raise exception 'Closing line required'; end if;
   if p.market='Moneyline' and (p_payload->>'line') is not null then raise exception 'Moneyline has no spread or total line'; end if;
   insert into public.closing_lines(pick_id,line,odds,source,observed_at) values(p.id,(p_payload->>'line')::numeric,(p_payload->>'odds')::numeric,p_payload->>'source',(p_payload->>'observed_at')::timestamptz) returning id into entity_id;
  elsif p_action='result' then
   if now()<kickoff then raise exception 'Cannot settle before kickoff'; end if;
   select * into ent from public.pick_entries where pick_id=p.id;
   if not found then raise exception 'Confirm actual bet entry before settlement'; end if;
   if coalesce((p_payload->>'no_bet')::boolean,false) then raise exception 'Only confirmed actual bets can settle'; end if;
   gain=case p_payload->>'result' when 'WIN' then round(p.stake_cents*case when ent.odds>0 then ent.odds/100 else 100/abs(ent.odds) end)::integer when 'LOSS' then -p.stake_cents when 'PUSH' then 0 when 'VOID' then 0 else null end;
   if gain is null then raise exception 'Invalid result'; end if;
   if p.stage_id is not null then
    select * into st from public.challenge_stages where id=p.stage_id;
    select * into ch from public.challenges where id=st.challenge_id for update;
    new_balance=ch.balance_cents+gain;
   end if;
   insert into public.pick_results(pick_id,result,away_score,home_score,profit_cents,bankroll_cents,source) values(p.id,p_payload->>'result',(p_payload->>'away_score')::integer,(p_payload->>'home_score')::integer,gain,new_balance,p_payload->>'source') returning id into entity_id;
   if p.stage_id is not null then
    update public.challenge_stages set status=case p_payload->>'result' when 'WIN' then 'WON' when 'LOSS' then 'LOST' else 'PUSH' end where id=st.id;
    update public.challenges set balance_cents=new_balance,status=case when new_balance=0 then 'LOST' when st.stage_number=5 then 'COMPLETED' when p_payload->>'result'='LOSS' then 'PASS / PAUSED' when p_payload->>'result'='WIN' then 'WON' else 'PUSH' end,current_stage=case when new_balance>0 and st.stage_number<5 then st.stage_number+1 else st.stage_number end,pause_reason=case when p_payload->>'result'='LOSS' and new_balance>0 then 'Losing leg; explicit resume required for remaining capital.' else null end where id=ch.id;
    insert into public.bankroll_transactions(challenge_id,pick_id,kind,amount_cents,balance_cents) values(ch.id,p.id,'SETTLEMENT',gain,new_balance);
   end if;
  else
   if not exists(select 1 from public.pick_results where pick_id=p.id) then raise exception 'Settle pick before process grading'; end if;
   insert into public.process_reviews(pick_id,grade,classification,lessons) values(p.id,p_payload->>'grade',p_payload->>'classification',p_payload->>'lessons') returning id into entity_id;
  end if;
 elsif p_action in ('pause','resume') then
  select * into ch from public.challenges where id=(p_payload->>'challenge_id')::uuid for update;
  if not found then raise exception 'Challenge not found'; end if;
  if ch.status in ('OFFICIAL PLAY','LOST','COMPLETED') then raise exception 'Cannot pause or resume a closed challenge or an open official play'; end if;
  if coalesce(trim(p_payload->>'reason'),'')='' then raise exception 'A reason is required'; end if;
  if p_action='pause' then
   update public.challenges set status='PASS / PAUSED',pause_reason=p_payload->>'reason' where id=ch.id;
   update public.challenge_stages set status='PASS / PAUSED',pass_reason=p_payload->>'reason' where challenge_id=ch.id and stage_number=ch.current_stage;
  else
   if ch.status<>'PASS / PAUSED' then raise exception 'Only a paused challenge can resume'; end if;
   v=coalesce((p_payload->>'next_stage')::integer,ch.current_stage);
   if v<ch.current_stage or v>5 then raise exception 'Choose the current or a later stage'; end if;
   if exists(select 1 from public.official_picks op join public.challenge_stages cs on cs.id=op.stage_id where cs.challenge_id=ch.id and cs.stage_number=v) then raise exception 'This stage already has a pick'; end if;
   update public.challenges set status='ANALYSIS IN PROGRESS',pause_reason=null,current_stage=v where id=ch.id;
   update public.challenge_stages set status='ANALYSIS IN PROGRESS' where challenge_id=ch.id and stage_number=v;
  end if;
  entity_id=ch.id;
  insert into public.audit_events(entity,entity_id,action,detail) values('challenge_decision',ch.id,upper(p_action),p_payload);
 elsif p_action='new_challenge' then
  if exists(select 1 from public.challenges where status not in ('COMPLETED','LOST')) then raise exception 'Complete the active challenge before creating another'; end if;
  insert into public.challenges default values returning id into entity_id;
  insert into public.challenge_stages(challenge_id,stage_number,slot) select entity_id,n,case n when 1 then 'Thursday Night Football' when 2 then 'Sunday · 1 PM' when 3 then 'Sunday · 4 PM' when 4 then 'Sunday Night Football' else 'Monday Night Football' end from generate_series(1,5) n;
  insert into public.bankroll_transactions(challenge_id,kind,amount_cents,balance_cents) values(entity_id,'START',2000,2000);
 else raise exception 'Unknown publishing action'; end if;
 receipt=jsonb_build_object('id',entity_id,'action',p_action);
 insert into private.publish_receipts(request_id,action,response) values(p_request_id,p_action,receipt);
 return receipt;
end $$;
create policy no_direct_access on private.admin_users for all to anon,authenticated using(false) with check(false);
create policy no_direct_access on private.publish_receipts for all to anon,authenticated using(false) with check(false);
