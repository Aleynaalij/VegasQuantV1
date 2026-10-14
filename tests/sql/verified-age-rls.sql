begin;
insert into auth.users(id,email,email_confirmed_at) values('00000000-0000-4000-8000-00000000fff1','age-rls@example.invalid',now());
insert into auth.sessions(id,user_id) values('00000000-0000-4000-8000-00000000fff2','00000000-0000-4000-8000-00000000fff1');
insert into public.community_profiles(user_id,username,visible) values('00000000-0000-4000-8000-00000000fff1','AgeFixture',true);
update private.age_policy set enforced=true;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000fff1',true);
select set_config('request.jwt.claim.session_id','00000000-0000-4000-8000-00000000fff2',true);
set local role authenticated;
do $$begin
 if (select count(*) from public.community_profiles)<>0 then raise exception 'Unverified member read through permissive RLS';end if;
 update public.community_profiles set username='BypassAttempt' where user_id=auth.uid();
 if found then raise exception 'Unverified member wrote through permissive RLS';end if;
end $$;
reset role;
do $$declare a jsonb;blocked boolean:=false;begin
 if (select username from public.community_profiles where user_id='00000000-0000-4000-8000-00000000fff1')<>'AgeFixture' then raise exception 'Blocked profile was changed';end if;
 begin
 insert into private.billing_orders(user_id,plan,amount,expires_at) values('00000000-0000-4000-8000-00000000fff1','monthly',500,now()+interval '1 day');
 exception when raise_exception then blocked=true;end;
 if not blocked then raise exception 'Unverified checkout accepted';end if;
 a=private.begin_age_check('00000000-0000-4000-8000-00000000fff1','00000000-0000-4000-8000-00000000fff2','2026-10-14');
 perform private.bind_age_check('00000000-0000-4000-8000-00000000fff1',(a->>'id')::uuid,'vs_RlsFixture');
 perform private.finish_age_check('00000000-0000-4000-8000-00000000fff1',(a->>'id')::uuid,'vs_RlsFixture','verified');
end $$;
select set_config('request.jwt.claim.session_id','00000000-0000-4000-8000-00000000fff2',true);
set local role authenticated;
do $$begin
 if (select count(*) from public.community_profiles)<>1 then raise exception 'Verified owner access missing';end if;
end $$;
reset role;
rollback;
