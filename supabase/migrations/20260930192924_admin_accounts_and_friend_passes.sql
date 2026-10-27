
create table private.friend_promos (
 id uuid primary key default gen_random_uuid(), label text not null,
 code text unique not null, max_uses integer not null check(max_uses between 1 and 10),
 used_count integer not null default 0 check(used_count>=0 and used_count<=max_uses),
 expires_at timestamptz not null, disabled_at timestamptz, created_at timestamptz not null default now()
);
create table private.friend_redemptions (
 id uuid primary key default gen_random_uuid(), promo_id uuid not null references private.friend_promos(id),
 user_id uuid not null references auth.users(id), membership_id uuid not null unique references private.memberships(id),
 redeemed_at timestamptz not null default now(), unique(promo_id,user_id)
);
create table private.promo_attempts (
 user_id uuid primary key references auth.users(id), window_start timestamptz not null, attempts integer not null
);
alter table private.friend_promos enable row level security;
alter table private.friend_redemptions enable row level security;
alter table private.promo_attempts enable row level security;
revoke all on private.friend_promos, private.friend_redemptions, private.promo_attempts from public, anon, authenticated;

insert into private.friend_promos(label,code,max_uses,expires_at)
values('Friends · 2026 full season','VQ-FRIENDS-'||upper(encode(extensions.gen_random_bytes(8),'hex')),10,'2027-02-16 12:00:00+00');

create function private.redeem_friend_pass(p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); p private.friend_promos; mid uuid; attempts_now integer;
begin
 if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null and (banned_until is null or banned_until<now())) then
  return jsonb_build_object('ok',false,'message','Confirm your email and sign in before redeeming.');
 end if;
 perform pg_advisory_xact_lock(hashtext(uid::text));
 insert into private.promo_attempts(user_id,window_start,attempts) values(uid,now(),1)
 on conflict(user_id) do update set
 attempts=case when private.promo_attempts.window_start<now()-interval '15 minutes' then 1 else private.promo_attempts.attempts+1 end,
 window_start=case when private.promo_attempts.window_start<now()-interval '15 minutes' then now() else private.promo_attempts.window_start end
 returning attempts into attempts_now;
 if attempts_now>5 then return jsonb_build_object('ok',false,'message','Too many attempts. Try again in 15 minutes.'); end if;
 select * into p from private.friend_promos where code=upper(btrim(left(p_code,100))) for update;
 if not found then return jsonb_build_object('ok',false,'message','Code is invalid, expired, or fully redeemed.'); end if;
 if exists(select 1 from private.friend_redemptions where promo_id=p.id and user_id=uid) then
  return jsonb_build_object('ok',true,'message','This account already redeemed this code.');
 end if;
 if p.disabled_at is not null or p.expires_at<=now() or p.used_count>=p.max_uses then
  return jsonb_build_object('ok',false,'message','Code is invalid, expired, or fully redeemed.');
 end if;
 if exists(select 1 from private.admin_users where user_id=uid) or exists(select 1 from private.memberships where user_id=uid and revoked_at is null and starts_at<=now() and expires_at>now()) then
  return jsonb_build_object('ok',false,'message','This account already has access. No redemption was used.');
 end if;
 insert into private.memberships(user_id,season,plan,expires_at) values(uid,'2026','full',p.expires_at) returning id into mid;
 insert into private.friend_redemptions(promo_id,user_id,membership_id) values(p.id,uid,mid);
 update private.friend_promos set used_count=used_count+1 where id=p.id;
 return jsonb_build_object('ok',true,'message','Full 2026 season access activated, including playoffs and the Super Bowl.','expires_at',p.expires_at);
end $$;
revoke all on function private.redeem_friend_pass(text) from public,anon;
grant execute on function private.redeem_friend_pass(text) to authenticated;
create function public.redeem_friend_pass(p_code text) returns jsonb language sql security invoker set search_path='' as $$ select private.redeem_friend_pass(p_code); $$;
revoke all on function public.redeem_friend_pass(text) from public,anon;
grant execute on function public.redeem_friend_pass(text) to authenticated;

create function private.admin_accounts(p_search text default '',p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.is_admin() then raise exception 'Verified administrator required' using errcode='42501'; end if;
 select jsonb_build_object(
 'total',(select count(*) from auth.users u where strpos(lower(coalesce(u.email,'')),lower(left(coalesce(p_search,''),120)))>0),
 'accounts',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (
 select u.id,u.email,u.created_at,u.last_sign_in_at,(u.email_confirmed_at is not null) as confirmed,
 exists(select 1 from private.admin_users a where a.user_id=u.id) as administrator,
 (select max(m.expires_at) from private.memberships m where m.user_id=u.id and m.revoked_at is null and m.starts_at<=now() and m.expires_at>now()) as access_until,
 exists(select 1 from private.friend_redemptions r where r.user_id=u.id) as friends_pass
 from auth.users u where strpos(lower(coalesce(u.email,'')),lower(left(coalesce(p_search,''),120)))>0
 order by u.created_at desc,u.id limit 50 offset (greatest(0,least(coalesce(p_page,0),100000))*50)
 ) t),
 'promos',(select coalesce(jsonb_agg(jsonb_build_object('label',label,'code',code,'used',used_count,'limit',max_uses,'expires_at',expires_at,'active',disabled_at is null and expires_at>now() and used_count<max_uses)),'[]'::jsonb) from private.friend_promos)
 ) into result;
 return result;
end $$;
revoke all on function private.admin_accounts(text,integer) from public,anon;
grant execute on function private.admin_accounts(text,integer) to authenticated;
create function public.admin_accounts(p_search text default '',p_page integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$ select private.admin_accounts(p_search,p_page); $$;
revoke all on function public.admin_accounts(text,integer) from public,anon;
grant execute on function public.admin_accounts(text,integer) to authenticated;
