-- Contributor opinions only; never grades platform picks or touches bankrolls.
alter table public.ruby_submissions drop constraint ruby_submissions_user_id_submission_day_key;
alter table public.ruby_submissions drop constraint ruby_submissions_sport_check;
alter table public.ruby_submissions add constraint ruby_submissions_sport_check check(sport in ('Soccer','NFL','NHL','NBA','Baseball','WNBA'));
do $$declare c record;begin for c in select conname from pg_constraint where conrelid='public.ruby_card_revisions'::regclass and contype='c' and pg_get_constraintdef(oid) like '%sport%' loop execute format('alter table public.ruby_card_revisions drop constraint %I',c.conname);end loop;end$$;
alter table public.ruby_card_revisions add constraint ruby_card_revisions_sport_check check(sport in ('Soccer','NFL','NHL','NBA','Baseball','WNBA'));
do $$declare d text;begin
 select pg_get_functiondef('private.submit_ruby(uuid,text,text,jsonb,text,text,text,integer)'::regprocedure) into d;
 d:=replace(d,'if exists(select 1 from public.ruby_submissions where user_id=auth.uid() and submission_day=(now() at time zone ''America/New_York'')::date) then','if (select count(*) from public.ruby_submissions where user_id=auth.uid() and submission_day=(now() at time zone ''America/New_York'')::date)>=3 then');
 d:=replace(d,'Your daily lay is already published. Come back after midnight Eastern.','All three daily slips are published. Come back after midnight Eastern.');execute d;
end$$;
create table public.ruby_result_reports(id uuid primary key default gen_random_uuid(),submission_id uuid not null references public.ruby_submissions on delete cascade,revision integer not null,outcome text not null check(outcome in ('WIN','LOSS','VOID','PENDING')),reported_by uuid references auth.users on delete set null,reported_at timestamptz not null default now());
create table public.ruby_visibility_events(id uuid primary key default gen_random_uuid(),submission_id uuid not null references public.ruby_submissions on delete cascade,hidden boolean not null,changed_by uuid references auth.users on delete set null,created_at timestamptz not null default now());
alter table public.ruby_result_reports enable row level security;alter table public.ruby_visibility_events enable row level security;
revoke all on public.ruby_result_reports,public.ruby_visibility_events from anon,authenticated;
grant select on public.ruby_result_reports,public.ruby_visibility_events to authenticated;
create policy ruby_reports_read on public.ruby_result_reports for select to authenticated using(exists(select 1 from public.ruby_submissions s where s.id=submission_id and private.ruby_visible(s.user_id)));
create policy ruby_visibility_read on public.ruby_visibility_events for select to authenticated using((select private.age_member_allowed()));
-- No direct member writes. RPCs below check ownership/admin and serialize on the original card.
create function public.report_ruby(p_submission uuid,p_outcome text,p_revision integer) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.ruby_submissions;n integer;last_report public.ruby_result_reports;rid uuid;
begin
 if not private.age_member_allowed() then raise exception 'Verified account required';end if;
 select * into s from public.ruby_submissions where id=p_submission for update;
 if not found or (s.user_id is distinct from auth.uid() and private.is_admin() is distinct from true) then raise exception 'Your own contributor card required';end if;
 if s.submission_day >= (now() at time zone 'America/New_York')::date then raise exception 'Results open the next Eastern day';end if;
 select coalesce(max(revision),0) into n from public.ruby_card_revisions where submission_id=s.id;
 if p_revision is distinct from n then raise exception 'Card changed. Reload first.';end if;
 select * into last_report from public.ruby_result_reports where submission_id=s.id order by reported_at desc,id desc limit 1;
 if last_report.id is not null and last_report.outcome<>'PENDING' and last_report.revision=n and private.is_admin() is distinct from true then raise exception 'Result already reported. Ask admin for a correction.';end if;
 insert into public.ruby_result_reports(submission_id,revision,outcome,reported_by) values(s.id,n,p_outcome,auth.uid()) returning id into rid;return rid;
end$$;
create function public.hide_ruby(p_submission uuid,p_hidden boolean) returns uuid language plpgsql security definer set search_path='' as $$declare rid uuid;begin
 if private.is_admin() is distinct from true then raise exception 'Verified admin required';end if;
 perform 1 from public.ruby_submissions where id=p_submission for update;if not found then raise exception 'Card not found';end if;
 insert into public.ruby_visibility_events(submission_id,hidden,changed_by) values(p_submission,p_hidden,auth.uid()) returning id into rid;return rid;end$$;
revoke all on function public.report_ruby(uuid,text,integer),public.hide_ruby(uuid,boolean) from public,anon;
grant execute on function public.report_ruby(uuid,text,integer),public.hide_ruby(uuid,boolean) to authenticated;
-- Filter hides for members; keep originals available for audit, history and result reporting.
create or replace view public.ruby_cards with(security_invoker=true) as
select s.id,s.user_id,s.brand,s.theme,s.submission_day,coalesce(r.sport,s.sport) sport,coalesce(r.title,s.title) title,coalesce(r.legs,s.legs) legs,coalesce(r.note,s.note) note,case when r.id is null then s.photo_path else r.photo_path end photo_path,case when r.id is null then s.sportsbook else r.sportsbook end sportsbook,case when r.id is null then s.reported_odds else r.reported_odds end reported_odds,s.created_at,coalesce(r.revision,0) revision,r.created_at edited_at,
coalesce(v.hidden,false) hidden,case when rr.revision=coalesce(r.revision,0) then rr.outcome else null end reported_result
from public.ruby_submissions s left join lateral(select * from public.ruby_card_revisions where submission_id=s.id order by revision desc limit 1) r on true
left join lateral(select * from public.ruby_visibility_events where submission_id=s.id order by created_at desc,id desc limit 1) v on true
left join lateral(select * from public.ruby_result_reports where submission_id=s.id order by reported_at desc,id desc limit 1) rr on true
where not coalesce(v.hidden,false) or (select public.is_admin());
create function public.ruby_record_summary() returns jsonb language sql stable security invoker set search_path='' as $$
select coalesce(jsonb_agg(x),'[]'::jsonb) from (select c.brand,count(*) filter(where q.outcome='WIN' and q.revision=coalesce(r.revision,0)) wins,count(*) filter(where q.outcome='LOSS' and q.revision=coalesce(r.revision,0)) losses,count(*) filter(where q.outcome='VOID' and q.revision=coalesce(r.revision,0)) voids,count(s.id) total from public.ruby_contributors c left join public.ruby_submissions s on s.user_id=c.user_id left join lateral(select * from public.ruby_result_reports where submission_id=s.id order by reported_at desc,id desc limit 1) q on true left join lateral(select revision from public.ruby_card_revisions where submission_id=s.id order by revision desc limit 1) r on true group by c.brand) x$$;
revoke all on function public.ruby_record_summary() from public,anon;grant execute on function public.ruby_record_summary() to authenticated;
create or replace function private.ruby_home() returns jsonb language sql stable security definer set search_path='' as $$
select case when private.age_member_allowed() then jsonb_build_object('user_id',auth.uid(),'day',(now() at time zone 'America/New_York')::date,'contributor',(select to_jsonb(c) from public.ruby_contributors c where c.user_id=auth.uid() and c.active),'submitted',(select id from public.ruby_submissions where user_id=auth.uid() and submission_day=(now() at time zone 'America/New_York')::date order by created_at desc limit 1),'submission_count',(select count(*) from public.ruby_submissions where user_id=auth.uid() and submission_day=(now() at time zone 'America/New_York')::date),'admin',public.is_admin(),'due',(select coalesce(jsonb_agg(x order by x.created_at),'[]') from (select s.id,s.brand,coalesce(r.title,s.title) title,s.created_at,coalesce(r.revision,0) revision,coalesce(r.legs,s.legs) legs,case when r.id is null then s.photo_path else r.photo_path end photo_path from public.ruby_submissions s left join lateral(select * from public.ruby_card_revisions where submission_id=s.id order by revision desc limit 1) r on true left join lateral(select * from public.ruby_result_reports where submission_id=s.id order by reported_at desc,id desc limit 1) rr on true where s.user_id=auth.uid() and s.submission_day<(now() at time zone 'America/New_York')::date and (rr.id is null or rr.revision<>coalesce(r.revision,0) or (rr.outcome='PENDING' and (rr.reported_at at time zone 'America/New_York')::date<(now() at time zone 'America/New_York')::date))) x)) else '{}'::jsonb end$$;
create index ruby_reports_latest on public.ruby_result_reports(submission_id,reported_at desc,id desc);
create index ruby_visibility_latest on public.ruby_visibility_events(submission_id,created_at desc,id desc);
