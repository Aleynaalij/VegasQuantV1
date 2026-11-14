-- Runs against isolated staging or PGlite. All identities and actions roll back.
begin;
insert into auth.users(id) select ('10000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid from generate_series(1,5) n;
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
  request uuid := '20000000-0000-4000-8000-000000000001';
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',member,'aal','aal2','user_metadata',jsonb_build_object('role','admin'))::text,true);
  begin perform public.blackbox_stage('list'); raise exception 'Member admitted'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'aal','aal1')::text,true);
  begin perform public.blackbox_stage('list'); raise exception 'Pre-MFA admitted'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'aal','aal2')::text,true);
  begin execute 'delete from blackbox.events'; raise exception 'Direct audit mutation allowed'; exception when insufficient_privilege then null; end;
  perform public.blackbox_stage('assign','test-lifecycle',0,request,'Synthetic assignment',codex);
  result := public.blackbox_stage('assign','test-lifecycle',0,request,'Synthetic assignment',codex);
  assert result->>'duplicate'='true';
  begin perform public.blackbox_stage('assign','test-lifecycle',0,request,'Changed evidence',codex); raise exception 'Request reused'; exception when unique_violation then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',claude,'aal','aal2')::text,true);
  assert not exists (select from jsonb_array_elements(public.blackbox_stage('list')->'tasks') t where t->>'id'='test-lifecycle');
  begin perform public.blackbox_stage('acknowledge','test-lifecycle',1,gen_random_uuid(),'Spoofed owner'); raise exception 'Spoof admitted'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',codex,'aal','aal2')::text,true);
  begin perform public.blackbox_stage('acknowledge','test-lifecycle',0,gen_random_uuid(),'Stale'); raise exception 'Stale accepted'; exception when serialization_failure then null; end;
  perform public.blackbox_stage('acknowledge','test-lifecycle',1,gen_random_uuid(),'Synthetic receipt');
  perform public.blackbox_stage('escalate','test-lifecycle',2,gen_random_uuid(),'Evidence source unavailable');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'aal','aal2')::text,true);
  perform public.blackbox_stage('handoff','test-lifecycle',3,gen_random_uuid(),'Synthetic handoff',claude);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',claude,'aal','aal2')::text,true);
  perform public.blackbox_stage('acknowledge','test-lifecycle',4,gen_random_uuid(),'Synthetic receipt');
  perform public.blackbox_stage('submit','test-lifecycle',5,gen_random_uuid(),'Synthetic reconciliation evidence');
  begin perform public.blackbox_stage('approve','test-lifecycle',6,gen_random_uuid(),'Self approval'); raise exception 'Self approval allowed'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'aal','aal2')::text,true);
  perform public.blackbox_stage('approve','test-lifecycle',6,gen_random_uuid(),'Independently reviewed synthetic evidence');
  select t into result from jsonb_array_elements(public.blackbox_stage('list')->'tasks') t where t->>'id'='test-lifecycle';
  assert result->>'status'='completed' and jsonb_array_length(result->'history')=7;
end
$$;
reset role;
rollback;
select 'blackbox staging lifecycle and denial checks passed' as validation;
