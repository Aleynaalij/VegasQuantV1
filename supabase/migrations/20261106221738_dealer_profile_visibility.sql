-- The attribution-only Dealer cannot sign in. Permit its image/profile to be displayed,
-- without relaxing login, membership, age, restriction or block checks for any viewer.
create function private.is_dealer_publisher(p_user uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from private.zone_automation a
 join auth.users u on u.id=a.user_id
 join public.community_profiles cp on cp.user_id=a.user_id
 where a.name='vq_dealer' and a.user_id=p_user and cp.username='TheDealer'
 and u.raw_app_meta_data->>'publisher'='vq_dealer'
 and u.banned_until='infinity'::timestamptz
 and u.email is null and u.phone is null and u.encrypted_password is null)
$$;
revoke all on function private.is_dealer_publisher(uuid) from public,anon,authenticated,service_role;

do $visibility$
declare signature text; body text; updated text;
 pattern text:='u.email_confirmed_at is not null[[:space:]]+and \(u.banned_until is null or u.banned_until[[:space:]]*<=[[:space:]]*now\(\)\)';
begin
 foreach signature in array array['public.community_avatars(uuid[])','private.community_activity()','private.before_age_community_member(text)'] loop
  select pg_get_functiondef(signature::regprocedure) into body;
  updated:=regexp_replace(body,pattern,'((\& ) or private.is_dealer_publisher(u.id))');
  if updated=body then raise exception 'Profile visibility guard changed: %',signature;end if;
  execute updated;
 end loop;
end $visibility$;
