  -- Injected into the existing rolled-back lifecycle after its reviewed outcome.
  declare
    package_id uuid := gen_random_uuid();
    approve_request uuid := gen_random_uuid();
    digest text;
    evidence jsonb := jsonb_build_object('source','synthetic dry run','commit',repeat('4',40),'ciHead',repeat('4',40),
      'files',jsonb_build_array('tests/blackbox-execution.test.ts'),'unit','pass','build','pass','ci','pass',
      'rollback','discard dry-run workspace','acceptance','fixture exercised');
  begin
    perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'session_id',overlay(admin::text placing '3' from 1 for 1),'aal','aal1')::text,true);
    begin perform public.blackbox_execution('list'); raise exception 'Pre-MFA admitted'; exception when insufficient_privilege then null; end;
    perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'session_id',overlay(admin::text placing '3' from 1 for 1),'aal','aal2')::text,true);
    perform public.blackbox_execution('propose',package_id,0,gen_random_uuid(),jsonb_build_object('task','test-lifecycle','outcomeVersion',11,'agent',codex));
    begin perform public.blackbox_execution('authorize',package_id,1,gen_random_uuid(),'{"scope":"merge"}'); raise exception 'Scope escalation allowed'; exception when insufficient_privilege then null; end;
    perform public.blackbox_execution('authorize',package_id,1,gen_random_uuid(),'{"scope":"execution"}');
    perform set_config('request.jwt.claims',jsonb_build_object('sub',claude,'session_id',overlay(claude::text placing '3' from 1 for 1),'aal','aal2')::text,true);
    assert jsonb_array_length(public.blackbox_execution('list')->'packages')=0;
    begin perform public.blackbox_execution('acknowledge',package_id,2,gen_random_uuid()); raise exception 'Wrong agent admitted'; exception when insufficient_privilege then null; end;
    perform set_config('request.jwt.claims',jsonb_build_object('sub',codex,'session_id',overlay(codex::text placing '3' from 1 for 1),'aal','aal2')::text,true);
    perform public.blackbox_execution('acknowledge',package_id,2,gen_random_uuid());
    begin perform public.blackbox_execution('submit',package_id,3,gen_random_uuid(),evidence||'{"files":["vercel.json"]}'); raise exception 'Scope drift accepted'; exception when invalid_parameter_value then null; end;
    perform public.blackbox_execution('submit',package_id,3,gen_random_uuid(),evidence);
    digest:=public.blackbox_execution('list')->'packages'->0->>'evidence_digest';
    begin perform public.blackbox_execution('approve',package_id,4,gen_random_uuid(),jsonb_build_object('digest',digest,'reason','Self')); raise exception 'Self-approval accepted'; exception when insufficient_privilege then null; end;
    perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'session_id',overlay(reviewer::text placing '3' from 1 for 1),'aal','aal2')::text,true);
    begin perform public.blackbox_execution('approve',package_id,4,gen_random_uuid(),'{"digest":"changed","reason":"Test"}'); raise exception 'Tampered evidence accepted'; exception when invalid_parameter_value then null; end;
    perform public.blackbox_execution('approve',package_id,4,approve_request,jsonb_build_object('digest',digest,'reason','Independent synthetic review'));
    assert public.blackbox_execution('approve',package_id,4,approve_request,jsonb_build_object('digest',digest,'reason','Independent synthetic review'))->>'duplicate'='true';
    begin perform public.blackbox_execution('approve',package_id,4,approve_request,jsonb_build_object('digest',digest,'reason','Changed')); raise exception 'Changed retry accepted'; exception when unique_violation then null; end;
    assert public.blackbox_execution('list')->'packages'->0->>'state'='approved';
    assert jsonb_array_length(public.blackbox_execution('list')->'packages'->0->'history')=5;
  end;
