-- Rollback-only integration checks. Synthetic accounts are never committed.
begin;
create temporary table test_context (u1 uuid,u2 uuid,pick uuid,e1 uuid,e2 uuid);
grant select,update on test_context to authenticated;
do $$
declare u1 uuid:=gen_random_uuid();u2 uuid:=gen_random_uuid();gid uuid:=gen_random_uuid();cid uuid:=gen_random_uuid();sid uuid:=gen_random_uuid();pid uuid:=gen_random_uuid();aid uuid:=gen_random_uuid();template jsonb;
begin
 insert into auth.users(id,email,email_confirmed_at) values(u1,u1::text||'@example.invalid',now()),(u2,u2::text||'@example.invalid',now());
 insert into private.memberships(user_id,season,plan,expires_at) values(u1,'2026','full',now()+interval '1 day'),(u2,'2026','full',now()+interval '1 day');
 insert into public.games(id,slug,away_team,home_team,kickoff,venue,slot) values(gid,'test-'||gid::text,'Test away','Test home',now()+interval '1 day','Test','Test');
 insert into public.challenges(id) values(cid);
 insert into public.challenge_stages(id,challenge_id,stage_number,slot,game_id) values(sid,cid,1,'Test',gid);
 insert into public.analysis_versions(id,game_id,version,title,raw_handoff) values(aid,gid,1,'TEST ONLY','TEST ONLY');
 select to_jsonb(p) into template from public.official_picks p limit 1;
 insert into public.official_picks select * from jsonb_populate_record(null::public.official_picks,template||jsonb_build_object('id',pid,'game_id',gid,'stage_id',sid,'analysis_id',aid,'created_at',now()-interval '1 hour'));
 insert into test_context values(u1,u2,pid,null,null);
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true) from test_context;
update test_context set e1=public.record_personal_entry(pick,22.5,-114,2000,3754,'Test book',now()-interval '1 minute',2000);
do $$ declare p uuid;begin
 select pick into p from test_context;
 begin
  perform public.record_personal_entry(p,22.5,-114,2000,3754,'Test book',now()-interval '1 minute',2000);
  raise exception 'TEST FAILURE duplicate accepted';
 exception when others then if sqlerrm not like 'You already recorded%' then raise; end if; end;
 begin
  perform public.admin_tail_entries((select u2 from test_context));
  raise exception 'TEST FAILURE member accessed admin RPC';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',u2,'role','authenticated')::text,true) from test_context;
do $$ begin
 if exists(select 1 from public.personal_entries) then raise exception 'TEST FAILURE another user sees private entry'; end if;
 if exists(select 1 from public.personal_challenges) then raise exception 'TEST FAILURE another user sees bankroll'; end if;
end $$;
update test_context set e2=public.record_personal_entry(pick,23.5,-110,1000,1909,'Test book',now()-interval '1 minute',1000);
reset role;
-- Grading official line settles only matching personal entries.
insert into public.pick_entries(pick_id,line,odds,source,bet_at) select pick,22.5,-114,'TEST',now()-interval '1 minute' from test_context;
insert into public.pick_results(pick_id,result,away_score,home_score,profit_cents,source) select pick,'WIN',0,0,1754,'TEST' from test_context;
do $$ begin
 if not exists(select 1 from public.personal_settlements s join test_context t on s.entry_id=t.e1 where s.result='WIN' and s.profit_cents=1754) then raise exception 'TEST FAILURE win settlement'; end if;
 if exists(select 1 from public.personal_settlements s join test_context t on s.entry_id=t.e2) then raise exception 'TEST FAILURE mismatched line auto-settled'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',u2,'role','authenticated')::text,true) from test_context;
do $$ begin
 if exists(select 1 from public.personal_settlements) then raise exception 'TEST FAILURE another user sees settlement'; end if;
 begin
  update public.personal_entries set odds=-200;
  raise exception 'TEST FAILURE user rewrote entry';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: owner isolation, duplicate rejection, admin denial, immutable entries, exact-line settlement and different-line hold' as result;
