begin;
insert into auth.users(id,email,email_confirmed_at) values ('10000000-0000-4000-8000-000000000001','membership-test@example.invalid',now());
set local role anon;
do $$ begin
 if (select count(*) from public.analysis_versions)<>0 or (select count(*) from public.audit_events)<>0 then raise exception 'Anonymous detail leak'; end if;
 if (public.desk_data()->'analyses')<>'[]'::jsonb then raise exception 'RPC leak'; end if;
 if has_function_privilege('anon','public.billing_order(uuid,uuid,text,timestamptz)','execute') then raise exception 'Anonymous billing grant'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
do $$ begin
 if (public.membership_status()->>'allowed')::boolean then raise exception 'Unpaid member allowed'; end if;
 if (select count(*) from public.analysis_versions)<>0 then raise exception 'Unpaid detail leak'; end if;
 if has_function_privilege('authenticated','public.billing_fulfill(uuid,text,text,integer,text,text)','execute') then raise exception 'Member can self-grant'; end if;
end $$;
reset role;
insert into private.memberships(user_id,season,plan,expires_at) values('10000000-0000-4000-8000-000000000001','2026','full',now()+interval '1 hour');
set local role authenticated;
do $$ begin
 if not (public.membership_status()->>'allowed')::boolean or (select count(*) from public.analysis_versions)=0 then raise exception 'Paid member cannot read'; end if;
 if public.is_admin() then raise exception 'Paid user is admin'; end if;
end $$;
reset role;
update private.memberships set revoked_at=now() where user_id='10000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin if (public.membership_status()->>'allowed')::boolean or (select count(*) from public.audit_events)<>0 then raise exception 'Revoked pass allowed'; end if; end $$;
reset role;
update private.memberships set revoked_at=null,starts_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where user_id='10000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin if (public.membership_status()->>'allowed')::boolean then raise exception 'Expired pass allowed'; end if; end $$;
reset role;
insert into private.admin_users(user_id) values('10000000-0000-4000-8000-000000000001');
set local role authenticated;
do $$ begin if public.is_admin() then raise exception 'Admin without MFA permitted'; end if; end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
do $$ begin if not public.is_admin() or not (public.membership_status()->>'allowed')::boolean then raise exception 'Verified admin denied'; end if; end $$;
reset role;
-- Billing repeats, price tampering, refund revocation.
select public.billing_order('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','full','2027-02-16T12:00:00Z');
do $$ begin
 begin perform public.billing_fulfill('20000000-0000-4000-8000-000000000001','cs_test','pi_test',1,'evt_wrong','test'); raise exception 'Accepted wrong amount'; exception when others then if sqlerrm='Accepted wrong amount' then raise; end if; end;
end $$;
select public.billing_fulfill('20000000-0000-4000-8000-000000000001','cs_test','pi_test',1000,'evt_ok','test');
select public.billing_fulfill('20000000-0000-4000-8000-000000000001','cs_test','pi_test',1000,'evt_ok','test');
do $$ begin if (select count(*) from private.memberships where order_id='20000000-0000-4000-8000-000000000001')<>1 then raise exception 'Duplicate grant'; end if; end $$;
select public.billing_revoke('pi_test','evt_refund','test');
select public.billing_fulfill('20000000-0000-4000-8000-000000000001','cs_test','pi_test',1000,'evt_late','test');
do $$ begin if exists(select 1 from private.memberships where order_id='20000000-0000-4000-8000-000000000001' and revoked_at is null) then raise exception 'Late event reactivated refund'; end if; end $$;
select 'Membership RLS, MFA, billing idempotency, and revocation checks passed' as result;
rollback;
