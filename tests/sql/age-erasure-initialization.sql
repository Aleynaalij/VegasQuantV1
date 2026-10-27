begin;
do $$declare u uuid:=gen_random_uuid();s uuid:=gen_random_uuid();a jsonb;lease jsonb;blocked boolean:=false;begin
 insert into auth.users(id,email,email_confirmed_at) values(u,'age-race-'||u||'@example.invalid',now());
 insert into auth.sessions(id,user_id) values(s,u);
 a=private.begin_age_check(u,s,'2026-10-14');
 begin perform private.begin_account_erasure(u,s);exception when raise_exception then blocked=true;end;
 if not blocked or exists(select 1 from private.account_erasure_jobs where user_id=u) then raise exception 'Erasure raced unbound identity creation';end if;
 perform private.bind_age_check(u,(a->>'id')::uuid,'vs_ErasureRace');
 lease=private.begin_account_erasure(u,s);
 if lease->>'lease' is null then raise exception 'Bound verification prevented inventory';end if;
 blocked=false;
 begin perform private.begin_age_check(u,s,'2026-10-14');exception when raise_exception then blocked=true;end;
 if not blocked then raise exception 'Identity creation raced an active erasure lease';end if;
end $$;
rollback;
