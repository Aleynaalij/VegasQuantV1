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
alter table test_context add column admin_id uuid, add column request_id uuid;
do $$ declare admin uuid:=gen_random_uuid();begin
 insert into auth.users(id,email,email_confirmed_at) values(admin,admin::text||'@example.invalid',now());
 insert into private.admin_users(user_id) values(admin);
 update test_context set admin_id=admin;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true) from test_context;
update test_context set request_id=public.request_entry_correction(e1,jsonb_build_object('line',22.5,'odds',-110,'stake_cents',1000,'payout_cents',1909,'book','Corrected test','placed_at',now()-interval '1 minute'),'Mistyped stake and odds');
do $$begin
 if (select odds from public.personal_entry_state where id=(select e1 from test_context))<>-114 then raise exception 'Pending correction changed balance'; end if;
 begin
  perform public.review_entry_correction((select request_id from test_context),true,'Member approval attempt',null);
  raise exception 'Member approved correction';
 exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',u2,'role','authenticated')::text,true) from test_context;
do $$begin
 if exists(select 1 from public.personal_correction_requests) then raise exception 'Request privacy leak'; end if;
 if exists(select 1 from public.personal_entry_state where user_id<>(select u2 from test_context)) then raise exception 'Effective entry privacy leak'; end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal1')::text,true) from test_context;
do $$begin
 begin perform public.review_entry_correction((select request_id from test_context),true,'Unverified admin attempt',null);raise exception 'MFA bypass'; exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2')::text,true) from test_context;
select public.review_entry_correction(request_id,true,'Verified corrected receipt',null) from test_context;
select public.admin_entry_corrections(false);
select public.admin_tail_entries(u1) from test_context;
select public.admin_accounts('',0);
do $$begin
 begin perform public.review_entry_correction((select request_id from test_context),true,'Duplicate review',null);raise exception 'Duplicate review accepted'; exception when others then if sqlerrm<>'Request already reviewed' then raise; end if;end;
end $$;
reset role;
do $$begin
 if (select odds from public.personal_entries where id=(select e1 from test_context))<>-114 then raise exception 'Original mutated';end if;
 if (select odds from public.personal_entry_state where id=(select e1 from test_context))<>-110 then raise exception 'Correction not applied';end if;
end $$;
insert into public.pick_entries(pick_id,line,odds,source,bet_at) select pick,22.5,-114,'TEST',now()-interval '1 minute' from test_context;
insert into public.pick_results(pick_id,result,away_score,home_score,profit_cents,source) select pick,'WIN',0,0,1754,'TEST' from test_context;
do $$begin
 if (select profit_cents from public.personal_settlements where entry_id=(select e1 from test_context))<>909 then raise exception 'Corrected payout not used for settlement';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true) from test_context;
update test_context set request_id=public.request_entry_correction(e1,jsonb_build_object('line',23.5,'odds',-110,'stake_cents',1000,'payout_cents',1909,'book','Corrected test','placed_at',now()-interval '1 minute'),'Actual line was 23.5');
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2')::text,true) from test_context;
do $$begin
 begin perform public.review_entry_correction((select request_id from test_context),true,'Missing grading check',null);raise exception 'Missing corrected result accepted';exception when others then if sqlerrm<>'Confirm the result for the corrected terms' then raise;end if;end;
end $$;
select public.review_entry_correction(request_id,true,'Verified result at corrected line','LOSS') from test_context;
reset role;
do $$begin
 if (select profit_cents from public.personal_settlements where entry_id=(select e1 from test_context))<>909 then raise exception 'Original settlement rewritten';end if;
 if (select profit_cents from public.personal_entry_state where id=(select e1 from test_context))<>-1000 then raise exception 'Corrected settlement not reflected';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true) from test_context;
update test_context set request_id=public.request_entry_correction(e1,jsonb_build_object('line',23.5,'odds',-110,'stake_cents',1000,'payout_cents',2000,'book','Another test','placed_at',now()-interval '1 minute'),'Another correction');
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2')::text,true) from test_context;
select public.review_entry_correction(request_id,false,'Receipt does not match',null) from test_context;
reset role;
do $$begin
 if (select book from public.personal_entry_state where id=(select e1 from test_context))<>'Corrected test' then raise exception 'Rejected correction took effect';end if;
end $$;
rollback;
