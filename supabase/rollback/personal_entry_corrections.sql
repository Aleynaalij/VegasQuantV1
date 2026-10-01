-- Restore previous application release first. This rollback retains correction audit records.
begin;
CREATE OR REPLACE FUNCTION private.admin_accounts(p_search text DEFAULT ''::text, p_page integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if not private.is_admin() then raise exception 'Verified administrator required' using errcode='42501'; end if;
 select jsonb_build_object(
 'total',(select count(*) from auth.users u where strpos(lower(coalesce(u.email,'')),lower(left(coalesce(p_search,''),120)))>0),
 'accounts',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (
 select u.id,u.email,u.created_at,u.last_sign_in_at,(u.email_confirmed_at is not null) as confirmed,
 exists(select 1 from private.admin_users a where a.user_id=u.id) as administrator,
 (select max(m.expires_at) from private.memberships m where m.user_id=u.id and m.revoked_at is null and m.starts_at<=now() and m.expires_at>now()) as access_until,
 exists(select 1 from private.friend_redemptions r where r.user_id=u.id) as friends_pass,
 (select count(*) from public.personal_entries e where e.user_id=u.id) as tail_count,
 (select count(*) from public.personal_entries e where e.user_id=u.id and not exists(select 1 from public.personal_settlements s where s.entry_id=e.id)) as open_tail_count
 from auth.users u where strpos(lower(coalesce(u.email,'')),lower(left(coalesce(p_search,''),120)))>0
 order by u.created_at desc,u.id limit 50 offset (greatest(0,least(coalesce(p_page,0),100000))*50)
 ) t),
 'promos',(select coalesce(jsonb_agg(jsonb_build_object('label',label,'code',code,'used',used_count,'limit',max_uses,'expires_at',expires_at,'active',disabled_at is null and expires_at>now() and used_count<max_uses)),'[]'::jsonb) from private.friend_promos)
 ) into result;
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION private.admin_tail_entries(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if not private.is_admin() then raise exception 'Verified administrator required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (
 select e.*,p.selection,c.number as challenge_number,s.result,s.profit_cents,
 (r.id is not null and s.id is null) as needs_review
 from public.personal_entries e join public.official_picks p on p.id=e.pick_id
 join public.personal_challenges a on a.id=e.personal_challenge_id join public.challenges c on c.id=a.challenge_id
 left join public.personal_settlements s on s.entry_id=e.id left join public.pick_results r on r.pick_id=e.pick_id
 where e.user_id=p_user_id order by e.created_at desc limit 50
 )t;
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION private.grade_personal_entry(p_entry_id uuid, p_result text, p_source text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.personal_entries; sid uuid;
begin
 if not private.is_admin() then raise exception 'Verified admin required'; end if;
 if p_result not in ('WIN','LOSS','PUSH','VOID') or p_result is null or coalesce(length(trim(p_source)),0)=0 then raise exception 'Result and source required'; end if;
 select * into strict e from public.personal_entries where id=p_entry_id for update;
 if not exists(select 1 from public.pick_results where pick_id=e.pick_id) then raise exception 'Publish the official result first'; end if;
 insert into public.personal_settlements(entry_id,user_id,result,profit_cents,source) values(e.id,e.user_id,p_result,case p_result when 'WIN' then e.payout_cents-e.stake_cents when 'LOSS' then -e.stake_cents else 0 end,p_source) returning id into sid;
 return sid;
end $function$
;
CREATE OR REPLACE FUNCTION private.record_personal_entry(p_pick_id uuid, p_line numeric, p_odds numeric, p_stake_cents integer, p_payout_cents integer, p_book text, p_placed_at timestamp with time zone, p_starting_cents integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid:=auth.uid(); p public.official_picks; g public.games; a public.personal_challenges; cid uuid; eid uuid; available bigint;
begin
 if uid is null or not private.has_membership() or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then raise exception 'Sign in with active research access'; end if;
 -- Same lock order as official grading: lock pick before personal account.
 select * into p from public.official_picks where id=p_pick_id for update;
 if not found or p.stage_id is null then raise exception 'Challenge pick required'; end if;
 if exists(select 1 from public.pick_results where pick_id=p.id) then raise exception 'This pick has already been graded'; end if;
 select * into g from public.games where id=p.game_id;
 if p_placed_at is null or p_placed_at>=g.kickoff or p_placed_at>now() or p_placed_at<p.created_at then raise exception 'Enter the actual placement time, after publication and before kickoff'; end if;
 if (p.market='Moneyline' and p_line is not null) or (p.market<>'Moneyline' and p_line is null) or p_line::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter your actual line'; end if;
 if p_odds is null or p_odds::text in ('NaN','Infinity','-Infinity') or abs(p_odds)<100 or abs(p_odds)>100000 then raise exception 'Invalid American odds'; end if;
 if p_stake_cents is null or p_stake_cents<1 or p_payout_cents is null or p_payout_cents<p_stake_cents or p_payout_cents>100000000 then raise exception 'Enter a valid cash stake and total return including stake'; end if;
 if coalesce(length(trim(p_book)),0) not between 1 and 100 then raise exception 'Sportsbook is required'; end if;
 select challenge_id into cid from public.challenge_stages where id=p.stage_id;
 perform pg_advisory_xact_lock(hashtextextended(uid::text||cid::text,0));
 select id into eid from public.personal_entries where user_id=uid and pick_id=p.id;
 if found then raise exception 'You already recorded this pick. The original entry is preserved.'; end if;
 select * into a from public.personal_challenges where user_id=uid and challenge_id=cid for update;
 if not found then
  if p_starting_cents is null or p_starting_cents<p_stake_cents then raise exception 'Starting bankroll must cover the stake'; end if;
  insert into public.personal_challenges(user_id,challenge_id,starting_cents) values(uid,cid,p_starting_cents) returning * into a;
 end if;
 select a.starting_cents+coalesce(sum(s.profit_cents),0)-coalesce(sum(case when s.id is null then e.stake_cents else 0 end),0) into available
 from public.personal_entries e left join public.personal_settlements s on s.entry_id=e.id where e.personal_challenge_id=a.id;
 if p_stake_cents>available then raise exception 'Stake exceeds your available personal bankroll'; end if;
 insert into public.personal_entries(user_id,personal_challenge_id,pick_id,line,odds,stake_cents,payout_cents,book,placed_at)
 values(uid,a.id,p.id,p_line,p_odds,p_stake_cents,p_payout_cents,trim(p_book),p_placed_at) returning id into eid;
 return eid;
end $function$
;
CREATE OR REPLACE FUNCTION private.settle_personal_entries()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare graded_line numeric;
begin
 -- Results describe the official actual entry, which may differ from publication.
 select line into graded_line from public.pick_entries where pick_id=new.pick_id;
 if not found then return new; end if;
 insert into public.personal_settlements(entry_id,user_id,result,profit_cents,source)
 select e.id,e.user_id,new.result,
 case new.result when 'WIN' then e.payout_cents-e.stake_cents when 'LOSS' then -e.stake_cents else 0 end,
 'Official result '||new.id::text||' / matching actual line'
 from public.personal_entries e where e.pick_id=new.pick_id and e.line is not distinct from graded_line
 on conflict(entry_id) do nothing;
 return new;
end $function$
;
commit;

