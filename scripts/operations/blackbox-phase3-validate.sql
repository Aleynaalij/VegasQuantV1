begin;
insert into auth.users(id,email_confirmed_at) values
 ('f0000000-0000-4000-8000-000000000001',now()),('f0000000-0000-4000-8000-000000000002',now());
insert into auth.sessions(id,user_id)
select replace(id::text,'f000','f100')::uuid,id from auth.users where id in
 ('f0000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000002');
insert into blackbox.principals values
 ('f0000000-0000-4000-8000-000000000001','admin'),('f0000000-0000-4000-8000-000000000002','claude');
insert into blackbox.tasks(id,proposal) select 'phase3-'||lpad(i::text,2,'0'),'{}' from generate_series(1,28) i;
set local role authenticated;
do $$
declare page jsonb;
begin
  perform set_config('request.jwt.claims','{"sub":"f0000000-0000-4000-8000-000000000001","session_id":"f1000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
  page:=public.blackbox_intelligence('page');
  assert jsonb_array_length(page->'tasks')=25;
  page:=public.blackbox_intelligence('page',p_after=>page->>'next');
  assert jsonb_array_length(page->'tasks')>=3;
  perform public.blackbox_intelligence('dependency','phase3-01','phase3-02',0,true);
  begin perform public.blackbox_intelligence('dependency','phase3-02','phase3-01',0,true); raise exception 'Cycle accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.blackbox_intelligence('dependency','phase3-01','phase3-03',0,true); raise exception 'Stale accepted'; exception when serialization_failure then null; end;
  begin perform public.blackbox_intelligence('dependency','phase3-01','missing',1,true); raise exception 'Missing accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.blackbox_stage('assign','phase3-01',0,gen_random_uuid(),'Fixture','f0000000-0000-4000-8000-000000000002'); raise exception 'Blocked assignment accepted'; exception when serialization_failure then null; end;
  perform public.blackbox_intelligence('briefing');
  assert public.blackbox_intelligence('page')->'briefing'->>'version'='1';
  perform set_config('request.jwt.claims','{"sub":"f0000000-0000-4000-8000-000000000002","session_id":"f1000000-0000-4000-8000-000000000002","aal":"aal2"}',true);
  assert jsonb_array_length(public.blackbox_intelligence('page')->'tasks')=0;
  begin perform public.blackbox_intelligence('dependency','phase3-02','phase3-03',0,true); raise exception 'Agent graph edit accepted'; exception when insufficient_privilege then null; end;
end
$$;
rollback;
select 'Phase 3 graph, scope, pagination and briefing checks passed' as result;
