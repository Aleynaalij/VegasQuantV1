-- One owner-requested surprise. This is NOT a recurring anniversary campaign.
-- Resolve the existing unique contributor once; never retarget on a username change.
create table private.frank_anniversary_config (
 singleton boolean primary key default true check(singleton),
 target_user_id uuid not null references auth.users(id) on delete cascade,
 enabled boolean not null default false,
 released_at timestamptz,
 check(not enabled or released_at is not null)
);
do $$ begin
 if (select count(*) from public.ruby_contributors where brand='FranksCorner' and active)<>1 then
  raise exception 'Expected exactly one active FranksCorner owner; do not guess a recipient';
 end if;
 insert into private.frank_anniversary_config(target_user_id)
 select user_id from public.ruby_contributors where brand='FranksCorner' and active;
end $$;

create table private.frank_anniversary_receipts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 token uuid not null unique default gen_random_uuid(),
 revealed_at timestamptz not null default now(),
 celebrated_at timestamptz,
 check(celebrated_at is null or celebrated_at>=revealed_at)
);
alter table private.frank_anniversary_config enable row level security;
alter table private.frank_anniversary_receipts enable row level security;
revoke all on private.frank_anniversary_config,private.frank_anniversary_receipts from public,anon,authenticated;
grant all on private.frank_anniversary_config,private.frank_anniversary_receipts to service_role;

create function private.frank_anniversary(p_action text default 'status',p_token uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg private.frank_anniversary_config; receipt private.frank_anniversary_receipts;
begin
 select * into cfg from private.frank_anniversary_config where singleton;
 if auth.uid() is null or not coalesce(private.age_member_allowed(),false)
  or not coalesce(cfg.enabled,false) or cfg.released_at>now()
  or auth.uid() is distinct from cfg.target_user_id
  or not exists(select 1 from public.ruby_contributors where user_id=auth.uid() and brand='FranksCorner' and active)
 then return '{"state":"hidden"}'::jsonb;end if;

 if p_action='arrive' then
  -- Only the authenticated target's pending handoff can start the celebration.
  -- The conditional UPDATE has one winner even across tabs/devices.
  update private.frank_anniversary_receipts set celebrated_at=now()
  where user_id=auth.uid() and token=p_token and celebrated_at is null
  returning * into receipt;
  if found then return '{"state":"celebrate"}'::jsonb;end if;
  return '{"state":"done"}'::jsonb;
 elsif p_action='reveal' then
  insert into private.frank_anniversary_receipts(user_id) values(auth.uid()) on conflict(user_id) do nothing;
 elsif p_action is distinct from 'status' then
  raise exception 'Unknown anniversary action';
 end if;

 select * into receipt from private.frank_anniversary_receipts where user_id=auth.uid();
 if not found then return '{"state":"offer"}'::jsonb;end if;
 if receipt.celebrated_at is not null then return '{"state":"done"}'::jsonb;end if;
 -- An interrupted navigation resumes the SAME handoff; it never creates another offer.
 return jsonb_build_object('state','revealed','token',receipt.token);
end $$;
create function public.frank_anniversary(p_action text default 'status',p_token uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
 select private.frank_anniversary(p_action,p_token)
$$;
revoke all on function private.frank_anniversary(text,uuid),public.frank_anniversary(text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.frank_anniversary(text,uuid),public.frank_anniversary(text,uuid) to authenticated;
-- Deliberately disabled. Release integration enables it ONLY after the whole multi-sport
-- product is deployed and verified. A schema deployment alone must not reveal the surprise.
