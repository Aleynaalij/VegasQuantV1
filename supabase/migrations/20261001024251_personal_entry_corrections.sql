create table public.personal_correction_requests (
 id uuid primary key default gen_random_uuid(), entry_id uuid not null references public.personal_entries(id),
 user_id uuid not null references auth.users(id), proposed jsonb not null,
 reason text not null check(length(trim(reason)) between 3 and 2000), created_at timestamptz not null default now()
);
create index correction_requests_entry_idx on public.personal_correction_requests(entry_id,created_at desc);
create index correction_requests_user_idx on public.personal_correction_requests(user_id);
create table public.personal_correction_decisions (
 id uuid primary key default gen_random_uuid(), sequence bigint generated always as identity,
 request_id uuid not null unique references public.personal_correction_requests(id),
 entry_id uuid not null references public.personal_entries(id), user_id uuid not null references auth.users(id),
 admin_id uuid not null references auth.users(id), approved boolean not null,
 snapshot jsonb not null, result_override text check(result_override in ('WIN','LOSS','PUSH','VOID')),
 note text not null check(length(trim(note)) between 3 and 2000), created_at timestamptz not null default now()
);
create index correction_decisions_entry_idx on public.personal_correction_decisions(entry_id,sequence desc);
create index correction_decisions_user_idx on public.personal_correction_decisions(user_id);
create index correction_decisions_admin_idx on public.personal_correction_decisions(admin_id);
do $$ declare t text; begin
 foreach t in array array['personal_correction_requests','personal_correction_decisions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy owner_read on public.%I for select to authenticated using(user_id=(select auth.uid()))',t);
  execute format('create trigger prevent_rewrite before update or delete on public.%I for each row execute function private.immutable()',t);
 end loop;
end $$;
-- A read model only. Every original row and each correction remain immutable.
create view public.personal_entry_state with(security_invoker=true) as
with effective as (
 select e.id,e.user_id,e.personal_challenge_id,e.pick_id,e.created_at,
 case when d.id is null then e.line else (d.snapshot->>'line')::numeric end as line,
 coalesce((d.snapshot->>'odds')::numeric,e.odds) as odds,
 coalesce((d.snapshot->>'stake_cents')::integer,e.stake_cents) as stake_cents,
 coalesce((d.snapshot->>'payout_cents')::integer,e.payout_cents) as payout_cents,
 coalesce(d.snapshot->>'book',e.book) as book,
 coalesce((d.snapshot->>'placed_at')::timestamptz,e.placed_at) as placed_at,
 coalesce(d.result_override,s.result) as result,
 d.id as correction_id,d.created_at as corrected_at,to_jsonb(e) as original
 from public.personal_entries e
 left join lateral(select * from public.personal_correction_decisions d where d.entry_id=e.id and d.approved order by d.sequence desc limit 1)d on true
 left join public.personal_settlements s on s.entry_id=e.id
)
select effective.*,case result when 'WIN' then payout_cents-stake_cents when 'LOSS' then -stake_cents when 'PUSH' then 0 when 'VOID' then 0 else null end as profit_cents from effective;
revoke all on public.personal_entry_state from public,anon,authenticated;
grant select on public.personal_entry_state to authenticated;

create function private.request_entry_correction(p_entry_id uuid,p_proposed jsonb,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.personal_entries; p public.official_picks; kickoff timestamptz; rid uuid; proposed jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select * into e from public.personal_entries where id=p_entry_id and user_id=auth.uid() for update;
 if not found then raise exception 'Entry not found'; end if;
 if exists(select 1 from public.personal_correction_requests r where r.entry_id=e.id and not exists(select 1 from public.personal_correction_decisions d where d.request_id=r.id)) then raise exception 'A correction is already awaiting review'; end if;
 if coalesce(length(trim(p_reason)),0) not between 3 and 2000 then raise exception 'Explain what needs correcting'; end if;
 select * into p from public.official_picks where id=e.pick_id;
 select g.kickoff into kickoff from public.games g where g.id=p.game_id;
 -- Rebuild only the allowed entry fields; no identity, ownership, pick, or result input.
 proposed=jsonb_build_object('line',(p_proposed->>'line')::numeric,'odds',(p_proposed->>'odds')::numeric,'stake_cents',(p_proposed->>'stake_cents')::integer,'payout_cents',(p_proposed->>'payout_cents')::integer,'book',trim(p_proposed->>'book'),'placed_at',(p_proposed->>'placed_at')::timestamptz);
 if (p.market='Moneyline' and proposed->>'line' is not null) or (p.market<>'Moneyline' and proposed->>'line' is null) or proposed->>'line' in ('NaN','Infinity','-Infinity') then raise exception 'Invalid actual line'; end if;
 if proposed->>'odds' is null or proposed->>'odds' in ('NaN','Infinity','-Infinity') or abs((proposed->>'odds')::numeric) not between 100 and 100000 then raise exception 'Invalid American odds'; end if;
 if coalesce((proposed->>'stake_cents')::integer,0) not between 1 and 100000000 or coalesce((proposed->>'payout_cents')::integer,0) not between (proposed->>'stake_cents')::integer and 100000000 then raise exception 'Invalid stake or total return'; end if;
 if coalesce(length(proposed->>'book'),0) not between 1 and 100 then raise exception 'Sportsbook required'; end if;
 if proposed->>'placed_at' is null or (proposed->>'placed_at')::timestamptz<p.created_at or (proposed->>'placed_at')::timestamptz>=kickoff or (proposed->>'placed_at')::timestamptz>now() then raise exception 'Placement must be after publication, before kickoff, and not in the future'; end if;
 insert into public.personal_correction_requests(entry_id,user_id,proposed,reason) values(e.id,e.user_id,proposed,trim(p_reason)) returning id into rid;
 return rid;
end $$;
revoke all on function private.request_entry_correction(uuid,jsonb,text) from public,anon;
grant execute on function private.request_entry_correction(uuid,jsonb,text) to authenticated;
create function public.request_entry_correction(p_entry_id uuid,p_proposed jsonb,p_reason text) returns uuid language sql security invoker set search_path='' as $$ select private.request_entry_correction(p_entry_id,p_proposed,p_reason); $$;
revoke all on function public.request_entry_correction(uuid,jsonb,text) from public,anon;
grant execute on function public.request_entry_correction(uuid,jsonb,text) to authenticated;

create function private.review_entry_correction(p_request_id uuid,p_approve boolean,p_note text,p_result text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.personal_correction_requests; e public.personal_entries; cid uuid; did uuid; available bigint; state_result text;
begin
 if not private.is_admin() then raise exception 'Verified admin required' using errcode='42501'; end if;
 if p_approve is null or coalesce(length(trim(p_note)),0) not between 3 and 2000 then raise exception 'Decision and explanation required'; end if;
 select * into strict r from public.personal_correction_requests where id=p_request_id;
 select * into strict e from public.personal_entries where id=r.entry_id;
 perform 1 from public.official_picks where id=e.pick_id for update;
 select challenge_id into cid from public.personal_challenges where id=e.personal_challenge_id;
 perform pg_advisory_xact_lock(hashtextextended(e.user_id::text||cid::text,0));
 perform 1 from public.personal_entries where id=e.id for update;
 perform 1 from public.personal_correction_requests where id=r.id for update;
 if exists(select 1 from public.personal_correction_decisions where request_id=r.id) then raise exception 'Request already reviewed'; end if;
 if p_approve then
  if exists(select 1 from public.pick_results where pick_id=e.pick_id) then
   if p_result is null or p_result not in ('WIN','LOSS','PUSH','VOID') then raise exception 'Confirm the result for the corrected terms'; end if;
   state_result=p_result;
  elsif p_result is not null then raise exception 'Cannot assign a result before official grading'; end if;
 end if;
 insert into public.personal_correction_decisions(request_id,entry_id,user_id,admin_id,approved,snapshot,result_override,note)
 values(r.id,e.id,e.user_id,auth.uid(),p_approve,r.proposed,state_result,trim(p_note)) returning id into did;
 if p_approve then
  select a.starting_cents+coalesce(sum(s.profit_cents),0)-coalesce(sum(case when s.result is null then s.stake_cents else 0 end),0) into available
  from public.personal_challenges a left join public.personal_entry_state s on s.personal_challenge_id=a.id where a.id=e.personal_challenge_id group by a.starting_cents;
  if available<0 then raise exception 'Corrected terms exceed the recorded bankroll; resolve bankroll discrepancy before approving'; end if;
 end if;
 return did;
end $$;
revoke all on function private.review_entry_correction(uuid,boolean,text,text) from public,anon;
grant execute on function private.review_entry_correction(uuid,boolean,text,text) to authenticated;
create function public.review_entry_correction(p_request_id uuid,p_approve boolean,p_note text,p_result text default null) returns uuid language sql security invoker set search_path='' as $$ select private.review_entry_correction(p_request_id,p_approve,p_note,p_result); $$;
revoke all on function public.review_entry_correction(uuid,boolean,text,text) from public,anon;
grant execute on function public.review_entry_correction(uuid,boolean,text,text) to authenticated;

create function private.admin_entry_corrections(p_pending_only boolean default true) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.is_admin() then raise exception 'Verified admin required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (
 select r.*,u.email,p.selection,to_jsonb(s) as current_entry,to_jsonb(d) as decision,
 exists(select 1 from public.pick_results where pick_id=e.pick_id) as official_graded
 from public.personal_correction_requests r join auth.users u on u.id=r.user_id
 join public.personal_entries e on e.id=r.entry_id join public.official_picks p on p.id=e.pick_id
 join public.personal_entry_state s on s.id=e.id left join public.personal_correction_decisions d on d.request_id=r.id
 where not p_pending_only or d.id is null order by r.created_at desc limit 100
 )t; return result;
end $$;
revoke all on function private.admin_entry_corrections(boolean) from public,anon;
grant execute on function private.admin_entry_corrections(boolean) to authenticated;
create function public.admin_entry_corrections(p_pending_only boolean default true) returns jsonb language sql stable security invoker set search_path='' as $$ select private.admin_entry_corrections(p_pending_only); $$;
revoke all on function public.admin_entry_corrections(boolean) from public,anon;
grant execute on function public.admin_entry_corrections(boolean) to authenticated;

create or replace function private.record_personal_entry(p_pick_id uuid,p_line numeric,p_odds numeric,p_stake_cents integer,p_payout_cents integer,p_book text,p_placed_at timestamptz,p_starting_cents integer) returns uuid
language plpgsql security definer set search_path='' as $$
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
 from public.personal_entry_state e left join lateral (select e.id,e.profit_cents where e.result is not null) s on true where e.personal_challenge_id=a.id;
 if p_stake_cents>available then raise exception 'Stake exceeds your available personal bankroll'; end if;
 insert into public.personal_entries(user_id,personal_challenge_id,pick_id,line,odds,stake_cents,payout_cents,book,placed_at)
 values(uid,a.id,p.id,p_line,p_odds,p_stake_cents,p_payout_cents,trim(p_book),p_placed_at) returning id into eid;
 return eid;
end $$;

create or replace function private.settle_personal_entries() returns trigger language plpgsql security definer set search_path='' as $$
declare graded_line numeric;
begin
 -- Results describe the official actual entry, which may differ from publication.
 select line into graded_line from public.pick_entries where pick_id=new.pick_id;
 if not found then return new; end if;
 insert into public.personal_settlements(entry_id,user_id,result,profit_cents,source)
 select e.id,e.user_id,new.result,
 case new.result when 'WIN' then e.payout_cents-e.stake_cents when 'LOSS' then -e.stake_cents else 0 end,
 'Official result '||new.id::text||' / matching actual line'
 from public.personal_entry_state e where e.pick_id=new.pick_id and e.line is not distinct from graded_line
 on conflict(entry_id) do nothing;
 return new;
end $$;

create or replace function private.grade_personal_entry(p_entry_id uuid,p_result text,p_source text) returns uuid language plpgsql security definer set search_path='' as $$
declare e record; sid uuid;
begin
 if not private.is_admin() then raise exception 'Verified admin required'; end if;
 if p_result not in ('WIN','LOSS','PUSH','VOID') or p_result is null or coalesce(length(trim(p_source)),0)=0 then raise exception 'Result and source required'; end if;
 perform 1 from public.official_picks where id=(select pick_id from public.personal_entries where id=p_entry_id) for update; perform 1 from public.personal_entries where id=p_entry_id for update; select * into strict e from public.personal_entry_state where id=p_entry_id;
 if e.result is not null then raise exception 'Entry already settled; use the correction review workflow'; end if;
 if not exists(select 1 from public.pick_results where pick_id=e.pick_id) then raise exception 'Publish the official result first'; end if;
 insert into public.personal_settlements(entry_id,user_id,result,profit_cents,source) values(e.id,e.user_id,p_result,case p_result when 'WIN' then e.payout_cents-e.stake_cents when 'LOSS' then -e.stake_cents else 0 end,p_source) returning id into sid;
 return sid;
end $$;

create or replace function private.admin_tail_entries(p_user_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.is_admin() then raise exception 'Verified administrator required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (
 select e.*,p.selection,c.number as challenge_number,
 (r.id is not null and e.result is null) as needs_review
 from public.personal_entry_state e join public.official_picks p on p.id=e.pick_id
 join public.personal_challenges a on a.id=e.personal_challenge_id join public.challenges c on c.id=a.challenge_id
 left join public.pick_results r on r.pick_id=e.pick_id
 where e.user_id=p_user_id order by e.created_at desc limit 50
 )t;
 return result;
end $$;

create or replace function private.admin_accounts(p_search text default '',p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
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
 (select count(*) from public.personal_entry_state e where e.user_id=u.id and e.result is null) as open_tail_count
 from auth.users u where strpos(lower(coalesce(u.email,'')),lower(left(coalesce(p_search,''),120)))>0
 order by u.created_at desc,u.id limit 50 offset (greatest(0,least(coalesce(p_page,0),100000))*50)
 ) t),
 'promos',(select coalesce(jsonb_agg(jsonb_build_object('label',label,'code',code,'used',used_count,'limit',max_uses,'expires_at',expires_at,'active',disabled_at is null and expires_at>now() and used_count<max_uses)),'[]'::jsonb) from private.friend_promos)
 ) into result;
 return result;
end $$;
