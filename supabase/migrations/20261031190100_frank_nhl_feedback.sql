-- Owner-requested NHL input from the already verified FranksCorner account.
do $$ begin
 if (select count(*) from private.frank_anniversary_config c join public.ruby_contributors r
     on r.user_id=c.target_user_id and r.brand='FranksCorner' and r.active where c.singleton)<>1
 or (select count(*) from public.ruby_contributors where brand='FranksCorner' and active)<>1 then
  raise exception 'Verified FranksCorner identity required; do not guess a recipient';
 end if;
end $$;

create table private.frank_nhl_feedback (
 request_id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 answers jsonb not null check(jsonb_typeof(answers)='object'),
 created_at timestamptz not null default now()
);
create index frank_nhl_feedback_latest on private.frank_nhl_feedback(user_id,created_at desc);
alter table private.frank_nhl_feedback enable row level security;
revoke all on private.frank_nhl_feedback from public,anon,authenticated,service_role;

create function private.frank_nhl_feedback(p_action text default 'status',p_answers jsonb default null,p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); cfg private.frank_anniversary_config; saved private.frank_nhl_feedback;
 normalized jsonb:='{}'; field text; value text;
begin
 select * into cfg from private.frank_anniversary_config where singleton;
 if actor is null or not coalesce(private.age_member_allowed(),false)
  or actor is distinct from cfg.target_user_id
  or (select count(*) from public.ruby_contributors where brand='FranksCorner' and active)<>1
  or not exists(select 1 from public.ruby_contributors where brand='FranksCorner' and active and user_id=actor)
  then return '{"state":"hidden"}'::jsonb;end if;
 -- Do not spoil the NHL anniversary invitation with an NHL survey before delivery.
 if coalesce(cfg.enabled,false) and not exists(
  select 1 from private.frank_anniversary_receipts where user_id=actor and celebrated_at is not null
 ) then return '{"state":"hidden"}'::jsonb;end if;

 if p_action='submit' then
  if p_request_id is null or jsonb_typeof(p_answers) is distinct from 'object' then raise exception 'Feedback and request ID required';end if;
  for field in select jsonb_object_keys(p_answers) loop
   if field not in ('track','players','expanded_report','notes') then raise exception 'Unknown feedback field';end if;
   if jsonb_typeof(p_answers->field) not in ('string','null') then raise exception 'Feedback fields must be text';end if;
  end loop;
  foreach field in array array['track','players','expanded_report','notes'] loop
   value:=btrim(coalesce(p_answers->>field,''),E' \t\n\r');
   if length(value)>3000 then raise exception 'Each answer must be at most 3000 characters';end if;
   normalized:=normalized||jsonb_build_object(field,value);
  end loop;
  if not exists(select 1 from jsonb_each_text(normalized) x where length(x.value)>0) then raise exception 'Please answer at least one question';end if;
  perform pg_advisory_xact_lock(hashtextextended('frank-nhl-feedback:'||actor::text,0));
  select * into saved from private.frank_nhl_feedback where request_id=p_request_id;
  if found then
   if saved.user_id<>actor or saved.answers<>normalized then raise exception 'Request ID already belongs to different feedback';end if;
  else
   insert into private.frank_nhl_feedback(request_id,user_id,answers) values(p_request_id,actor,normalized) returning * into saved;
  end if;
 elsif p_action='status' then
  select * into saved from private.frank_nhl_feedback where user_id=actor order by created_at desc,request_id desc limit 1;
 else raise exception 'Unknown feedback action';end if;
 if saved.request_id is null then return '{"state":"offer"}'::jsonb;end if;
 return jsonb_build_object('state','submitted','answers',saved.answers,'submitted_at',saved.created_at);
end $$;
create function public.frank_nhl_feedback(p_action text default 'status',p_answers jsonb default null,p_request_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$select private.frank_nhl_feedback(p_action,p_answers,p_request_id)$$;
revoke all on function private.frank_nhl_feedback(text,jsonb,uuid),public.frank_nhl_feedback(text,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function private.frank_nhl_feedback(text,jsonb,uuid),public.frank_nhl_feedback(text,jsonb,uuid) to authenticated;

create function private.frank_nhl_feedback_review() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(private.is_admin(),false) or not coalesce(private.age_member_allowed(),false) then
  raise exception 'Verified admin access required' using errcode='42501';
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',f.request_id,'answers',f.answers,'submitted_at',f.created_at) order by f.created_at desc,f.request_id desc)
  from (select * from private.frank_nhl_feedback order by created_at desc,request_id desc limit 25) f),'[]'::jsonb);
end $$;
create function public.frank_nhl_feedback_review() returns jsonb language sql security invoker set search_path='' as $$select private.frank_nhl_feedback_review()$$;
revoke all on function private.frank_nhl_feedback_review(),public.frank_nhl_feedback_review() from public,anon,authenticated,service_role;
grant execute on function private.frank_nhl_feedback_review(),public.frank_nhl_feedback_review() to authenticated;
