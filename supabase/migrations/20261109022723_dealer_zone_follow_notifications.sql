-- Future live results appear once in The Zone. Member-origin notifications require a follow;
-- the verified Dealer publisher and system/security notices are exempt from that follow rule.
-- This does not enable push/email, bypass blocks/age/access, regrade picks, or replay old alerts.
-- Prerequisite: deployed dealer_publisher_identity + dealer_profile_visibility migrations.
begin;
do $$begin
 if to_regprocedure('private.is_dealer_publisher(uuid)') is null then
  raise exception 'Dealer identity migration required; reconcile deployed source migrations first';
 end if;
end$$;

create function private.notification_actor_followed(p_recipient uuid,p_actor uuid,p_type text)
returns boolean language sql stable security definer set search_path='' as $$
 select p_actor is null or p_type in ('security','password_change','account')
 or private.is_dealer_publisher(p_actor)
 or exists(select 1 from public.member_follows f where f.user_id=p_recipient and f.target_user_id=p_actor)
$$;
revoke all on function private.notification_actor_followed(uuid,uuid,text) from public,anon,authenticated,service_role;

-- Old projections can contain several actors. Hide the whole old group if any contributor is
-- no longer followed; never leak their names/count via a currently-followed final actor.
create function private.notification_group_followed(p_id uuid,p_recipient uuid,p_actor uuid,p_type text)
returns boolean language sql stable security definer set search_path='' as $$
 select private.notification_actor_followed(p_recipient,p_actor,p_type)
 and not exists(select 1 from private.notification_events e where e.notification_id=p_id
  and not private.notification_actor_followed(p_recipient,e.actor_id,e.type))
$$;
revoke all on function private.notification_group_followed(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
create function private.notification_follow_inbox_allowed(p_id uuid,p_recipient uuid,p_actor uuid,p_type text)
returns boolean language sql stable security definer set search_path='' as $$
 select p_recipient=auth.uid() and private.notification_group_followed(p_id,p_recipient,p_actor,p_type)
$$;
revoke all on function private.notification_follow_inbox_allowed(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.notification_follow_inbox_allowed(uuid,uuid,uuid,text) to authenticated;
create policy notification_follow_contract on public.notifications as restrictive for select to authenticated
using(private.notification_follow_inbox_allowed(id,recipient_id,actor_id,type));

-- Patch only precise anchors, retaining every existing access/consent guard and function ACL.
do $$declare definition text;old text;begin
 select pg_get_functiondef('private.emit_notification(uuid,uuid,text,text,uuid,uuid,uuid,text,text)'::regprocedure) into definition;
 old:='if p_recipient is null or p_recipient=p_actor then return null;end if;';
 if position(old in definition)=0 then raise exception 'Emitter contract changed';end if;
 definition:=replace(definition,old,old||E'\n if not private.notification_actor_followed(p_recipient,p_actor,p_type) then return null;end if;');
 old:='insert into public.notifications(recipient_id,actor_id,actor_name,actor_avatar,type,content_id,post_id,comment_id,message,priority,deep_link,group_key,actor_names)';
 if position(old in definition)=0 then raise exception 'Notification grouping contract changed';end if;
 -- New social groups have one actor, so unfollowing affects that actor's activity only.
 definition:=replace(definition,old,E'if p_actor is not null and p_type not in (''security'',''password_change'',''account'') then bucket:=bucket||'':actor:''||p_actor::text;end if;\n '||old);
 execute definition;
 select pg_get_functiondef('public.claim_social_notification_deliveries()'::regprocedure) into definition;
 old:='select array_agg(id) into jobs';
 if position(old in definition)=0 then raise exception 'Claim scheduling contract changed';end if;
 definition:=replace(definition,old,$patch$
 update private.notification_deliveries d set state='suppressed',last_error='not_following'
 from public.notifications n where d.notification_id=n.id
 and (d.state='pending' or(d.state='leased' and d.lease_until<now())) and d.due_at<=now()
 and not private.notification_group_followed(n.id,n.recipient_id,n.actor_id,n.type);
 select array_agg(id) into jobs$patch$);
 old:='and (n.actor_id is null or private.age_eligible(n.recipient_id))';
 if position(old in definition)=0 then raise exception 'Claim audience contract changed';end if;
 definition:=replace(definition,old,old||' and private.notification_group_followed(n.id,n.recipient_id,n.actor_id,n.type)');
 execute definition;
 select pg_get_functiondef('public.social_notification_delivery_allowed(uuid,uuid)'::regprocedure) into definition;
 old:='and n.type<>all(p.disabled_types)';
 if position(old in definition)=0 then raise exception 'Dispatch audience contract changed';end if;
 execute replace(definition,old,old||' and private.notification_group_followed(n.id,n.recipient_id,n.actor_id,n.type)');
end$$;

alter table private.live_pick_alerts add column zone_post_id uuid references public.community_posts(id) on delete set null;
create index live_pick_alert_zone_post on private.live_pick_alerts(zone_post_id) where zone_post_id is not null;
-- This matcher grants no caller privileges. Only trusted server trigger contexts may use it.
create function private.is_live_pick_zone_post(p public.community_posts) returns boolean
language sql stable security invoker set search_path='' as $$
 select private.is_dealer_publisher(p.user_id) and p.kind='talk' and p.title='Live pick update'
 and p.legs='[]'::jsonb and p.photo_path is null
 and exists(select 1 from private.live_pick_alerts a
  where p.id=md5('live-pick-zone:'||a.pick_id::text)::uuid and p.sport=a.sport and p.body=a.message)
$$;
revoke all on function private.is_live_pick_zone_post(public.community_posts) from public,anon,authenticated,service_role;

-- Keep author, profile, safety, attachment and member rate checks. Only exact server-generated
-- result rows may arrive together when several games/picks finish at the same moment.
do $$declare definition text;old text;begin
 select pg_get_functiondef('private.prepare_member_publication()'::regprocedure) into definition;
 old:='declare username text;';
 if position(old in definition)=0 then raise exception 'Publication declaration changed';end if;
 definition:=replace(definition,old,'declare username text;trusted_result boolean:=false;');
 old:='if exists(select 1 from public.community_posts where user_id=auth.uid() and created_at>now()-interval ''30 seconds'') then';
 if position(old in definition)=0 then raise exception 'Publication rate contract changed';end if;
 definition:=replace(definition,old,$patch$if current_user='postgres' then trusted_result:=private.is_live_pick_zone_post(new);end if;
 if not trusted_result and exists(select 1 from public.community_posts where user_id=auth.uid() and created_at>now()-interval '30 seconds') then$patch$);
 execute definition;
 -- The result already has its original pick alert. Do not send a second mention notification
 -- if a source player label happens to contain @ followed by a member's username.
 select pg_get_functiondef('private.notification_social_event()'::regprocedure) into definition;
 old:='if TG_TABLE_NAME=''member_follows'' then';
 if position(old in definition)=0 then raise exception 'Social event contract changed';end if;
 definition:=replace(definition,old,$patch$if TG_TABLE_NAME='community_posts' then
  if private.is_live_pick_zone_post(new) then return new;end if;
 end if;
 if TG_TABLE_NAME='member_follows' then$patch$);
 execute definition;
end$$;

create or replace function private.zone_post_notify() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient record;mentioned text[];link text;dealer boolean;
begin
 if private.is_live_pick_zone_post(new) then return new;end if;
 dealer:=private.is_dealer_publisher(new.user_id);
 if current_setting('vq.automated_post',true)='on' and not dealer then return new;end if;
 select coalesce(array_agg(distinct lower(m[2])),'{}') into mentioned
 from regexp_matches(coalesce(new.body,''),'(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{3,24})\M','g') m;
 link:='/community?sport='||new.sport||'&post='||new.id::text||'#post-'||new.id::text;
 for recipient in
  select u.id from auth.users u left join public.community_profiles cp on cp.user_id=u.id
  where u.email_confirmed_at is not null and u.id<>new.user_id
  and (dealer or exists(select 1 from public.member_follows f where f.user_id=u.id and f.target_user_id=new.user_id))
  and (cp.username is null or lower(cp.username)<>all(mentioned))
 loop
  perform private.emit_notification(recipient.id,new.user_id,'post','post:'||new.id::text,new.id,new.id,null,
   'posted in The Zone: '||left(coalesce(nullif(btrim(new.title),''),new.body,''),160),link);
 end loop;
 return new;
end$$;

create function private.post_live_pick_result(p_pick uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare a private.live_pick_alerts;author uuid;post uuid;
 old_sub text:=current_setting('request.jwt.claim.sub',true);
 old_claims text:=current_setting('request.jwt.claims',true);
 old_automated text:=current_setting('vq.automated_post',true);
begin
 select * into strict a from private.live_pick_alerts where pick_id=p_pick;
 select user_id into author from private.zone_automation where name='vq_dealer';
 if author is null or not private.is_dealer_publisher(author) then raise exception 'Verified Dealer publisher required';end if;
 post:=md5('live-pick-zone:'||p_pick::text)::uuid;
 perform set_config('request.jwt.claim.sub',author::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',author,'role','authenticated')::text,true);
 perform set_config('vq.automated_post','on',true);
 insert into public.community_posts(id,user_id,sport,kind,title,body,legs)
 values(post,author,a.sport,'talk','Live pick update',a.message,'[]'::jsonb);
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 perform set_config('vq.automated_post',coalesce(old_automated,''),true);
 update private.live_pick_alerts set zone_post_id=post where pick_id=p_pick;
 return post;
 -- An error rolls back this whole function, including local settings and the inserted post.
end$$;
revoke all on function private.post_live_pick_result(uuid) from public,anon,authenticated,service_role;

do $$declare definition text;old text;begin
 select pg_get_functiondef('private.live_pick_alert(text,uuid,text,text)'::regprocedure) into definition;
 old:='if not found then return 0;end if;';
 if position(old in definition)=0 then raise exception 'Live alert deduplication contract changed';end if;
 -- Same transaction and winner as the alert ledger: failure retries cleanly, success posts once.
 execute replace(definition,old,old||E'\n perform private.post_live_pick_result(p_pick);');
end$$;
commit;
