-- Runs against isolated staging or PGlite. All identities and actions roll back.
begin;
insert into auth.users(id,email_confirmed_at) select ('10000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,now() from generate_series(1,5) n;
insert into auth.sessions(id,user_id) select overlay(id::text placing '3' from 1 for 1)::uuid,id from auth.users where id::text like '10000000-0000-4000-8000-00000000000%';
insert into blackbox.principals values
 ('10000000-0000-4000-8000-000000000001','admin'),
 ('10000000-0000-4000-8000-000000000002','codex'),
 ('10000000-0000-4000-8000-000000000003','claude'),
 ('10000000-0000-4000-8000-000000000004','reviewer');
insert into blackbox.tasks(id,proposal) values ('test-lifecycle','{}');
set local role authenticated;
do $$
declare
  admin uuid := '10000000-0000-4000-8000-000000000001';
  codex uuid := '10000000-0000-4000-8000-000000000002';
  claude uuid := '10000000-0000-4000-8000-000000000003';
  reviewer uuid := '10000000-0000-4000-8000-000000000004';
  member uuid := '10000000-0000-4000-8000-000000000005';
  result jsonb;
  approval_request uuid := gen_random_uuid();
  request uuid := '20000000-0000-4000-8000-000000000001';
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',member,'session_id',overlay(member::text placing '3' from 1 for 1),'aal','aal2','user_metadata',jsonb_build_object('role','admin'))::text,true);
  begin perform public.blackbox_stage('list'); raise exception 'Member admitted'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'session_id',overlay(admin::text placing '3' from 1 for 1),'aal','aal1')::text,true);
  begin perform public.blackbox_stage('list'); raise exception 'Pre-MFA admitted'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'session_id',overlay(admin::text placing '3' from 1 for 1),'aal','aal2')::text,true);
  begin execute 'delete from blackbox.events'; raise exception 'Direct audit mutation allowed'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'session_id',overlay(admin::text placing '4' from 1 for 1),'aal','aal2')::text,true);
  begin perform public.blackbox_stage('assign','test-lifecycle',0,request,'Synthetic assignment',codex); raise exception 'Revoked assign allowed'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'session_id',overlay(admin::text placing '3' from 1 for 1),'aal','aal2')::text,true);
  perform public.blackbox_stage('assign','test-lifecycle',0,request,'Synthetic assignment',codex);
  result := public.blackbox_stage('assign','test-lifecycle',0,request,'Synthetic assignment',codex);
  assert result->>'duplicate'='true';
  begin perform public.blackbox_stage('assign','test-lifecycle',0,request,'Changed evidence',codex); raise exception 'Request reused'; exception when unique_violation then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',claude,'session_id',overlay(claude::text placing '3' from 1 for 1),'aal','aal2')::text,true);
  assert not exists (select from jsonb_array_elements(public.blackbox_stage('list')->'tasks') t where t->>'id'='test-lifecycle');
  begin perform public.blackbox_stage('acknowledge','test-lifecycle',1,gen_random_uuid(),'Spoofed owner'); raise exception 'Spoof admitted'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',codex,'session_id',overlay(codex::text placing '3' from 1 for 1),'aal','aal2')::text,true);
  begin perform public.blackbox_stage('acknowledge','test-lifecycle',0,gen_random_uuid(),'Stale'); raise exception 'Stale accepted'; exception when serialization_failure then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',codex,'session_id',overlay(codex::text placing '4' from 1 for 1),'aal','aal2')::text,true);
  begin perform public.blackbox_stage('acknowledge','test-lifecycle',1,gen_random_uuid(),'Synthetic receipt'); raise exception 'Revoked acknowledge allowed'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',codex,'session_id',overlay(codex::text placing '3' from 1 for 1),'aal','aal2')::text,true);
  perform public.blackbox_stage('acknowledge','test-lifecycle',1,gen_random_uuid(),'Synthetic receipt');
  perform public.blackbox_stage('escalate','test-lifecycle',2,gen_random_uuid(),'Evidence source unavailable');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'session_id',overlay(admin::text placing '3' from 1 for 1),'aal','aal2')::text,true);
  perform public.blackbox_stage('handoff','test-lifecycle',3,gen_random_uuid(),'Synthetic handoff',claude);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',claude,'session_id',overlay(claude::text placing '3' from 1 for 1),'aal','aal2')::text,true);
  perform public.blackbox_stage('acknowledge','test-lifecycle',4,gen_random_uuid(),'Synthetic receipt');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',claude,'session_id',overlay(claude::text placing '4' from 1 for 1),'aal','aal2')::text,true);
  begin perform public.blackbox_stage('submit','test-lifecycle',5,gen_random_uuid(),'Synthetic reconciliation evidence'); raise exception 'Revoked submit allowed'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',claude,'session_id',overlay(claude::text placing '3' from 1 for 1),'aal','aal2')::text,true);
  perform public.blackbox_stage('submit','test-lifecycle',5,gen_random_uuid(),'Synthetic reconciliation evidence');
  begin perform public.blackbox_stage('approve','test-lifecycle',6,gen_random_uuid(),'Self approval',null,'{"conclusion":"Self","confidence":"high"}'); raise exception 'Self approval allowed'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'session_id',overlay(reviewer::text placing '3' from 1 for 1),'aal','aal2')::text,true);
  perform public.blackbox_stage('reject','test-lifecycle',6,gen_random_uuid(),'Synthetic evidence lacks corroboration');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'session_id',overlay(admin::text placing '3' from 1 for 1),'aal','aal2')::text,true);
  perform public.blackbox_stage('handoff','test-lifecycle',7,gen_random_uuid(),'Return to first investigator',codex);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',codex,'session_id',overlay(codex::text placing '3' from 1 for 1),'aal','aal2')::text,true);
  perform public.blackbox_stage('acknowledge','test-lifecycle',8,gen_random_uuid(),'Synthetic receipt');
  perform public.blackbox_stage('submit','test-lifecycle',9,gen_random_uuid(),'Corroborated synthetic evidence');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'session_id',overlay(reviewer::text placing '3' from 1 for 1),'aal','aal2')::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'session_id',overlay(reviewer::text placing '4' from 1 for 1),'aal','aal2')::text,true);
  begin perform public.blackbox_stage('approve','test-lifecycle',10,approval_request,'Independent synthetic review',null,'{"conclusion":"Synthetic reconciliation","confidence":"high"}'); raise exception 'Revoked approve allowed'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'session_id',overlay(reviewer::text placing '3' from 1 for 1),'aal','aal2')::text,true);
  perform public.blackbox_stage('approve','test-lifecycle',10,approval_request,'Independent synthetic review',null,'{"conclusion":"Synthetic reconciliation","confidence":"high"}');
  result := public.blackbox_stage('approve','test-lifecycle',10,approval_request,'Independent synthetic review',null,'{"conclusion":"Synthetic reconciliation","confidence":"high"}');
  assert result->>'duplicate'='true';
  begin
    perform public.blackbox_stage('approve','test-lifecycle',10,approval_request,'Independent synthetic review',null,'{"conclusion":"Changed","confidence":"high"}');
    raise exception 'Outcome changed on retry';
  exception when unique_violation then null; end;
  begin execute 'delete from blackbox.memory'; raise exception 'Direct memory mutation allowed'; exception when insufficient_privilege then null; end;
  select t into result from jsonb_array_elements(public.blackbox_stage('list')->'tasks') t where t->>'id'='test-lifecycle';
  assert result->>'status'='completed' and jsonb_array_length(result->'history')=11 and jsonb_array_length(result->'outcomes')=1;
  assert public.blackbox_intelligence('review',p_task=>'test-lifecycle',p_version=>11,
    p_review=>'{"recommendation":"Corroborate journal timestamps","classification":"journal","effectiveness":"unmeasured","evidence":"Reviewed fixture"}')->>'revision'='1';
  select t into result from jsonb_array_elements(public.blackbox_intelligence('page')->'tasks') t where t->>'id'='test-lifecycle';
  assert result->'reviews'->0->>'classification'='journal';

end
$$;
reset role;
rollback;
select 'blackbox staging lifecycle and denial checks passed' as validation;
