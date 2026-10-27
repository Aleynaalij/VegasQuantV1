begin;
do $$
declare u uuid:=gen_random_uuid(); sess uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid(); account uuid; entry uuid; correction uuid; orderid uuid:=gen_random_uuid(); plan jsonb; blocked boolean:=false; picks integer; results integer; research integer;
begin
 if has_function_privilege('anon','public.begin_account_erasure(uuid,uuid)','EXECUTE') or has_function_privilege('authenticated','public.authorize_account_erasure(uuid,uuid)','EXECUTE') or has_function_privilege('service_role','private.erase_member_dependencies()','EXECUTE') then raise exception 'Erasure privileges too broad';end if;
 select count(*) into picks from public.official_picks;select count(*) into results from public.pick_results;select count(*) into research from public.research_feed_posts;
 insert into auth.users(id,email) values(u,'erasure-test-'||u::text||'@example.invalid');
 insert into auth.sessions(id,user_id) values(sess,u);
 insert into auth.users(id,email) values(other_user,'erasure-other-'||other_user::text||'@example.invalid');
 insert into public.saved_legs(user_id,leg_key) values(other_user,'OTHER MEMBER');
 insert into public.community_profiles(user_id,username,avatar,visible) values(u,'Erase_'||left(replace(u::text,'-',''),12),'data:image/jpeg;base64,AA==',true);
 insert into public.personal_challenges(user_id,challenge_id,starting_cents) values(u,(select id from public.challenges limit 1),1000) returning id into account;
 insert into public.personal_entries(user_id,personal_challenge_id,pick_id,odds,stake_cents,payout_cents,book,placed_at) values(u,account,(select id from public.official_picks limit 1),-110,100,191,'ROLLBACK TEST',now()) returning id into entry;
 insert into public.personal_settlements(entry_id,user_id,result,profit_cents,source) values(entry,u,'VOID',0,'ROLLBACK TEST');
 insert into public.personal_correction_requests(entry_id,user_id,proposed,reason) values(entry,u,'{}','ROLLBACK TEST') returning id into correction;
 insert into public.personal_correction_decisions(request_id,entry_id,user_id,admin_id,approved,snapshot,note) values(correction,entry,u,(select user_id from private.admin_users limit 1),false,'{}','ROLLBACK TEST');
 insert into private.billing_orders(id,user_id,plan,amount,expires_at,state,checkout_id) values(orderid,u,'monthly',500,now()+interval '30 days','paid','cs_rollback_test');
 insert into private.billing_subscriptions(id,user_id,order_id,customer_id,status) values('sub_'||u,u,orderid,'cus_rollback_test','canceled');
 insert into private.billing_invoices(id,subscription_id,period_end) values('in_'||u,'sub_'||u,now());
 insert into private.memberships(user_id,season,plan,expires_at,order_id) values(u,'2026','full',now()+interval '1 day',orderid);
 insert into public.saved_legs(user_id,leg_key) values(u,'ROLLBACK SAVED');
 begin delete from auth.users where id=u;exception when raise_exception then blocked=true;end;
 if not blocked or not exists(select 1 from public.personal_entries where id=entry) then raise exception 'Unauthorized erasure guard failed';end if;
 plan=private.begin_account_erasure(u,sess);
 if jsonb_array_length(plan->'subscriptions')<>1 then raise exception 'Billing references omitted';end if;
 perform private.authorize_account_erasure(u,(plan->>'lease')::uuid);
 -- Force a restrictive reference failure after the cleanup trigger has run.
 create table public.erasure_failure_probe(owner_id uuid references auth.users(id));
 insert into public.erasure_failure_probe values(u);
 blocked=false;
 begin delete from auth.users where id=u;exception when foreign_key_violation then blocked=true;end;
 if not blocked or not exists(select 1 from public.personal_entries where id=entry) or not exists(select 1 from private.billing_orders where id=orderid) or not exists(select 1 from public.community_profiles where user_id=u) then raise exception 'Failed cleanup did not roll back';end if;
 drop table public.erasure_failure_probe;
 delete from auth.users where id=u;
 if not exists(select 1 from auth.users where id=other_user) or not exists(select 1 from public.saved_legs where user_id=other_user) then raise exception 'Another member changed';end if;
 if exists(select 1 from auth.users where id=u) or exists(select 1 from auth.sessions where user_id=u) or exists(select 1 from public.personal_entries where user_id=u) or exists(select 1 from public.personal_settlements where user_id=u) or exists(select 1 from public.personal_challenges where user_id=u) or exists(select 1 from public.community_profiles where user_id=u) or exists(select 1 from private.billing_orders where user_id=u) or exists(select 1 from public.saved_legs where user_id=u) then raise exception 'Account cleanup incomplete';end if;
 if (select count(*) from public.official_picks)<>picks or (select count(*) from public.pick_results)<>results or (select count(*) from public.research_feed_posts)<>research then raise exception 'Published record changed';end if;
end $$;
rollback;
