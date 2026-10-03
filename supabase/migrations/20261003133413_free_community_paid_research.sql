-- Free, explicitly allowlisted publication projection. Underlying research RLS stays paid.
-- This intentional public definer returns official publication fields only, never user records.
create function private.free_challenge_desk() returns jsonb
language sql stable security definer set search_path='' as $$
select jsonb_build_object('free_core',true,'access',public.membership_status(),'overview',private.public_overview(),
'games',(select coalesce(jsonb_agg(to_jsonb(x) order by kickoff),'[]'::jsonb) from (select id,slug,away_team,home_team,kickoff,venue,slot,created_at from public.games) x),
'challenges',(select coalesce(jsonb_agg(to_jsonb(x) order by number desc),'[]'::jsonb) from (select id,number,name,starting_cents,target_cents,balance_cents,status,current_stage,pause_reason,created_at from public.challenges) x),
'stages',(select coalesce(jsonb_agg(to_jsonb(x) order by stage_number),'[]'::jsonb) from (select id,challenge_id,stage_number,slot,game_id,status,pass_reason from public.challenge_stages) x),
'picks',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]'::jsonb) from (select id,game_id,stage_id,market,selection,recommended_line,direction,odds,stake_cents,model_probability,market_probability,edge,confidence,risk,predicted_close,best_number,bet_grade,fear_index,timing,why_like,why_lose,playable_number,pass_number,book,created_at,market_info_url from public.official_picks) x),
'entries',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]'::jsonb) from (select id,pick_id,line,odds,source,bet_at,created_at from public.pick_entries) x),
'closings',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]'::jsonb) from (select id,pick_id,line,odds,source,observed_at,created_at from public.closing_lines) x),
'results',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]'::jsonb) from (select id,pick_id,result,away_score,home_score,profit_cents,bankroll_cents,source,created_at from public.pick_results) x),
'transactions',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]'::jsonb) from (select id,challenge_id,pick_id,kind,amount_cents,balance_cents,created_at from public.bankroll_transactions) x),'markets','[]'::jsonb,'analyses','[]'::jsonb,'reviews','[]'::jsonb,'audit','[]'::jsonb);
$$;
revoke all on function private.free_challenge_desk() from public,anon,authenticated;
grant execute on function private.free_challenge_desk() to anon,authenticated;
-- Retain the existing invoker/RLS research branch for paid accounts.
do $migration$
declare def text;
begin
 select pg_get_functiondef('public.desk_data()'::regprocedure) into def;
 if position('private.free_challenge_desk()' in def)=0 then
  def:=replace(def,'select jsonb_build_object(', 'select case when private.has_membership() then jsonb_build_object(');
  def:=replace(def,'); $function$',') else private.free_challenge_desk() end; $function$');
  if position('else private.free_challenge_desk() end' in def)=0 then raise exception 'Unexpected desk_data definition'; end if;
  execute def;
 end if;
end $migration$;
-- Edge release snapshots are published content. Do not expose unpublished target rows.
create function private.published_edge_releases() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]'::jsonb)
 from (select official_pick_id,created_at,items from public.edge_releases order by created_at desc limit 1) x;
$$;
revoke all on function private.published_edge_releases() from public,anon,authenticated;
grant execute on function private.published_edge_releases() to anon,authenticated;
create function public.published_edge_releases() returns jsonb
language sql stable security invoker set search_path='' as $$ select private.published_edge_releases(); $$;
revoke all on function public.published_edge_releases() from public,anon,authenticated;
grant execute on function public.published_edge_releases() to anon,authenticated;
-- Basic personal accounting is free. Keep confirmed-account, owner, validation,
-- locking, immutable history and payout-pause protections in the existing functions.
do $migration$
declare f record; def text;
begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname in ('start_personal_bankroll','record_personal_entry','update_personal_bankroll') loop
  def:=pg_get_functiondef(f.oid);
  if position('or not private.has_membership()' in def)=0 then raise exception 'Expected billing guard missing'; end if;
  def:=replace(def,'or not private.has_membership() ', '');
  def:=replace(def, 'Sign in with active research access', 'Sign in with a confirmed account');
  if position('(banned_until is null or banned_until<=now())' in def)=0 then
    def:=replace(def,'email_confirmed_at is not null)', 'email_confirmed_at is not null and (banned_until is null or banned_until<=now()))');
  end if;
  execute def;
 end loop;
end $migration$;
