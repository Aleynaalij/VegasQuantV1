alter table public.push_subscriptions add column last_test_at timestamptz not null default '-infinity'::timestamptz;
create function public.claim_push_test(p_user uuid, p_endpoint text default null) returns jsonb
language sql security invoker set search_path='' as $$
 with claimed as (
  update public.push_subscriptions set last_test_at=now()
  where user_id=p_user and (p_endpoint is null or endpoint=p_endpoint)
    and last_test_at < now()-interval '1 minute'
  returning id,endpoint,p256dh,auth
 ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'endpoint',endpoint,'keys',jsonb_build_object('p256dh',p256dh,'auth',auth))),'[]'::jsonb) from claimed;
$$;
revoke all on function public.claim_push_test(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_push_test(uuid,text) to service_role;
