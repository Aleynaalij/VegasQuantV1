-- Personal notifications are transactional projections; only trusted triggers/service events create them.
create table public.notification_preferences(
 user_id uuid primary key references auth.users on delete cascade,
 disabled_types text[] not null default '{}',push_enabled boolean not null default false,email_enabled boolean not null default false,
 sound_enabled boolean not null default false,haptics_enabled boolean not null default false,
 batch_minutes integer not null default 5 check(batch_minutes between 1 and 30),timezone text not null default 'America/New_York',
 quiet_enabled boolean not null default false,quiet_start integer not null default 22 check(quiet_start between 0 and 23),quiet_end integer not null default 8 check(quiet_end between 0 and 23),
 updated_at timestamptz not null default now(),check(disabled_types <@ array['like','comment','reply','mention','follow','share','comment_reaction','message','group_message','message_request','message_reminder','profile_reminder','feature','suggestion']::text[])
);
create table public.notifications(
 id uuid primary key default gen_random_uuid(),recipient_id uuid not null references auth.users on delete cascade,
 actor_id uuid references auth.users on delete cascade,actor_name text not null,actor_avatar text,
 type text not null check(type in ('like','comment','reply','mention','follow','share','comment_reaction','message','group_message','message_request','message_reminder','welcome','profile_reminder','security','password_change','account','feature','suggestion')),
 content_id uuid,post_id uuid references public.community_posts on delete cascade,comment_id uuid references public.community_post_comments on delete cascade,
 message text not null check(length(message)<=400),priority text not null check(priority in ('critical','high','medium','low')),
 deep_link text not null check(deep_link ~ '^/(community|notifications|membership|account|messages)([/?#]|$)' and deep_link !~ '^//'),
 group_key text not null,event_count integer not null default 1,actor_names text[] not null default '{}',
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),read_at timestamptz,viewed_at timestamptz,
 unique(recipient_id,group_key)
);
create index notification_inbox on public.notifications(recipient_id,updated_at desc,id desc);
create index notification_unread on public.notifications(recipient_id,updated_at desc) where read_at is null;
create function private.notification_search_document(p_actor text,p_names text[],p_message text) returns text language sql immutable parallel safe set search_path='' as $$select p_actor||' '||coalesce(array_to_string(p_names,' '),'')||' '||p_message$$;
revoke all on function private.notification_search_document(text,text[],text) from public,anon;
grant execute on function private.notification_search_document(text,text[],text) to authenticated;
create index notification_search on public.notifications using gin(to_tsvector('simple',private.notification_search_document(actor_name,actor_names,message)));
create table private.notification_events(
 recipient_id uuid not null references auth.users on delete cascade,event_key text not null,type text not null,actor_id uuid references auth.users on delete cascade,
 notification_id uuid references public.notifications on delete set null,created_at timestamptz not null default now(),primary key(recipient_id,event_key)
);
create index notification_event_rate on private.notification_events(actor_id,recipient_id,created_at desc);
create table private.notification_presence(user_id uuid not null references auth.users on delete cascade,device uuid not null,last_seen timestamptz not null default now(),visible boolean not null default true,primary key(user_id,device));
create index notification_presence_active on private.notification_presence(user_id,last_seen desc) where visible;
create table private.notification_deliveries(
 id uuid primary key default gen_random_uuid(),notification_id uuid not null references public.notifications on delete cascade,
 channel text not null check(channel in ('push','email')),subscription_id uuid references public.push_subscriptions on delete cascade,
 state text not null default 'pending' check(state in ('pending','leased','sent','suppressed','blocked','dead')),
 due_at timestamptz not null default now(),attempts integer not null default 0,lease uuid,lease_until timestamptz,
 sent_at timestamptz,last_error text,created_at timestamptz not null default now()
);
create unique index notification_delivery_device on private.notification_deliveries(notification_id,subscription_id) where channel='push';
create unique index notification_delivery_email on private.notification_deliveries(notification_id) where channel='email';
create index notification_delivery_due on private.notification_deliveries(due_at,id) where state in ('pending','leased');
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table private.notification_events enable row level security;
alter table private.notification_presence enable row level security;
alter table private.notification_deliveries enable row level security;
revoke all on public.notifications,public.notification_preferences,private.notification_events,private.notification_presence,private.notification_deliveries from public,anon,authenticated;
grant select,delete on public.notifications to authenticated;
grant update(read_at,viewed_at) on public.notifications to authenticated;
grant select,insert,update on public.notification_preferences to authenticated;
create policy notification_own_read on public.notifications for select to authenticated using(recipient_id=(select auth.uid()) and (actor_id is null or (private.age_member_allowed() and private.community_member_allowed(actor_id))));
create policy notification_own_update on public.notifications for update to authenticated using(recipient_id=(select auth.uid())) with check(recipient_id=(select auth.uid()));
create policy notification_own_delete on public.notifications for delete to authenticated using(recipient_id=(select auth.uid()));
create policy notification_pref_read on public.notification_preferences for select to authenticated using(user_id=(select auth.uid()));
create policy notification_pref_insert on public.notification_preferences for insert to authenticated with check(user_id=(select auth.uid()));
create policy notification_pref_update on public.notification_preferences for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

create function private.notification_pref_guard() returns trigger language plpgsql set search_path='' as $$begin
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then raise exception 'Invalid timezone';end if;
 new.updated_at:=now();return new;end$$;
create trigger notification_pref_guard before insert or update on public.notification_preferences for each row execute function private.notification_pref_guard();

create function private.emit_notification(p_recipient uuid,p_actor uuid,p_type text,p_key text,p_content uuid default null,p_post uuid default null,p_comment uuid default null,p_message text default '',p_link text default '/notifications') returns uuid
language plpgsql security definer set search_path='' as $$
declare prefs public.notification_preferences;notif uuid;actor_label text:='Vegas Quant';v_avatar text;importance text;bucket text;cnt integer;window_minutes integer;
begin
 if p_recipient is null or p_recipient=p_actor then return null;end if;
 if not exists(select 1 from auth.users where id=p_recipient and email_confirmed_at is not null) then return null;end if;
 if exists(select 1 from private.account_erasure_jobs where user_id=p_recipient and expires_at>now()) then return null;end if;
 importance:=case when p_type in ('message','group_message','message_request','security','password_change','account') then 'critical' when p_type in ('comment','reply','mention','share') then 'high' when p_type in ('like','follow','comment_reaction') then 'medium' else 'low' end;
 if p_actor is not null then
  if not private.age_eligible(p_recipient) or exists(select 1 from public.member_blocks where (user_id=p_recipient and target_user_id=p_actor) or (user_id=p_actor and target_user_id=p_recipient))
   or exists(select 1 from private.community_restrictions where user_id in(p_actor,p_recipient)) then return null;end if;
  select cp.username,cp.avatar into actor_label,v_avatar from public.community_profiles cp where cp.user_id=p_actor and cp.visible;
  if actor_label is null then return null;end if;
 end if;
 insert into public.notification_preferences(user_id) values(p_recipient) on conflict do nothing;
 select * into prefs from public.notification_preferences where user_id=p_recipient;
 if p_type=any(prefs.disabled_types) then return null;end if;
 -- Unique event keys and the group upsert make event dedup and counts atomic.
 insert into private.notification_events(recipient_id,event_key,type,actor_id) values(p_recipient,left(p_key,240),p_type,p_actor) on conflict do nothing;
 if not found then return null;end if;
 if p_actor is not null and importance<>'critical' and (select count(*) from private.notification_events where actor_id=p_actor and recipient_id=p_recipient and created_at>now()-interval '1 minute')>20 then return null;end if;
 window_minutes:=case when importance='medium' then prefs.batch_minutes else 1 end;
 bucket:=case when importance in ('critical','low') then p_key else p_type||':'||coalesce(p_post,p_content,p_recipient)::text||':'||floor(extract(epoch from now())/(60*window_minutes))::text end;
 insert into public.notifications(recipient_id,actor_id,actor_name,actor_avatar,type,content_id,post_id,comment_id,message,priority,deep_link,group_key,actor_names)
 values(p_recipient,p_actor,actor_label,v_avatar,p_type,p_content,p_post,p_comment,left(p_message,400),importance,p_link,bucket,array[actor_label])
 on conflict(recipient_id,group_key) do update set actor_id=excluded.actor_id,actor_name=excluded.actor_name,actor_avatar=excluded.actor_avatar,message=excluded.message,
 comment_id=excluded.comment_id,deep_link=excluded.deep_link,event_count=public.notifications.event_count+1,
 actor_names=case when excluded.actor_name=any(public.notifications.actor_names) then public.notifications.actor_names else array[public.notifications.actor_names[1],excluded.actor_name] end,
 updated_at=clock_timestamp(),read_at=null,viewed_at=null returning id,event_count into notif,cnt;
 update private.notification_events set notification_id=notif where recipient_id=p_recipient and event_key=left(p_key,240);
 -- First event in each group queues delivery; later likes update the inbox without another push.
 if cnt=1 and prefs.push_enabled and importance<>'low' then
  insert into private.notification_deliveries(notification_id,channel,subscription_id,due_at)
  select notif,'push',id,now()+case when importance='medium' then make_interval(mins=>prefs.batch_minutes) else interval '10 seconds' end
  from public.push_subscriptions where user_id=p_recipient on conflict do nothing;
 end if;
 if cnt=1 and prefs.email_enabled and importance='critical' then
  insert into private.notification_deliveries(notification_id,channel) values(notif,'email') on conflict do nothing;
 end if;
 return notif;
end$$;
revoke all on function private.emit_notification(uuid,uuid,text,text,uuid,uuid,uuid,text,text) from public,anon,authenticated;

-- Replies and comment reactions share the existing post permissions.
alter table public.community_post_comments add column parent_id uuid references public.community_post_comments(id) on delete set null;
alter table public.community_post_comments add constraint community_reply_not_self check(parent_id is distinct from id);
create index community_comment_parent on public.community_post_comments(parent_id) where parent_id is not null;
create table public.community_comment_reactions(comment_id uuid not null references public.community_post_comments on delete cascade,user_id uuid not null references auth.users on delete cascade,created_at timestamptz not null default now(),primary key(comment_id,user_id));
create table public.community_shares(post_id uuid not null references public.community_posts on delete cascade,user_id uuid not null references auth.users on delete cascade,created_at timestamptz not null default now(),primary key(post_id,user_id));
alter table public.community_comment_reactions enable row level security;
alter table public.community_shares enable row level security;
revoke all on public.community_comment_reactions,public.community_shares from public,anon,authenticated;
grant select,insert,delete on public.community_comment_reactions to authenticated;
grant insert on public.community_shares to authenticated;
create policy comment_reaction_read on public.community_comment_reactions for select to authenticated using(exists(select 1 from public.community_post_comments c where c.id=comment_id));
create policy comment_reaction_insert on public.community_comment_reactions for insert to authenticated with check(user_id=(select auth.uid()) and private.age_member_allowed() and exists(select 1 from public.community_post_comments c where c.id=comment_id and private.community_member_allowed(c.user_id)));
create policy comment_reaction_delete on public.community_comment_reactions for delete to authenticated using(user_id=(select auth.uid()));
create policy community_share_insert on public.community_shares for insert to authenticated with check(user_id=(select auth.uid()) and private.age_member_allowed() and exists(select 1 from public.community_posts p where p.id=post_id and private.community_member_allowed(p.user_id)));
create function private.notification_social_event() returns trigger language plpgsql security definer set search_path='' as $$
declare post public.community_posts;comment public.community_post_comments;parent public.community_post_comments;recipient uuid;mention text;link text;kind text;
begin
 if TG_TABLE_NAME='member_follows' then
  perform private.emit_notification(new.target_user_id,new.user_id,'follow','follow:'||new.user_id::text,new.user_id,null,null,'started following you.','/community/'||(select username from public.community_profiles where user_id=new.user_id));return new;
 end if;
 if TG_TABLE_NAME='community_comment_reactions' then
  select * into comment from public.community_post_comments where id=new.comment_id;
  select * into post from public.community_posts where id=comment.post_id;
  link:='/community?sport='||post.sport||'&post='||post.id::text||'&comment='||comment.id::text||'#comment-'||comment.id::text;
  perform private.emit_notification(comment.user_id,new.user_id,'comment_reaction','comment_reaction:'||new.comment_id::text||':'||new.user_id::text,comment.id,post.id,comment.id,'reacted to your comment.',link);return new;
 end if;
 if TG_TABLE_NAME in ('community_reactions','community_shares') then
  select * into post from public.community_posts where id=new.post_id;
  kind:=case when TG_TABLE_NAME='community_reactions' then 'like' else 'share' end;
  perform private.emit_notification(post.user_id,new.user_id,kind,kind||':'||post.id::text||':'||new.user_id::text,post.id,post.id,null,case when kind='like' then 'liked your post.' else 'shared your post link.' end,'/community?sport='||post.sport||'&post='||post.id::text||'#post-'||post.id::text);return new;
 end if;
 if TG_TABLE_NAME='community_post_comments' then
  select * into post from public.community_posts where id=new.post_id;
  if new.parent_id is not null then
   select * into parent from public.community_post_comments where id=new.parent_id;
   if parent.post_id is distinct from new.post_id or not private.community_member_allowed(parent.user_id) then raise exception 'Reply must belong to the same post';end if;
  end if;
  link:='/community?sport='||post.sport||'&post='||post.id::text||'&comment='||new.id::text||'#comment-'||new.id::text;
  perform private.emit_notification(post.user_id,new.user_id,case when parent.user_id=post.user_id then 'reply' else 'comment' end,'comment:'||new.id::text,new.id,post.id,new.id,case when parent.user_id=post.user_id then 'replied to your comment: ' else 'commented on your post: ' end||left(new.body,180),link);
  if parent.user_id is not null and parent.user_id<>post.user_id then perform private.emit_notification(parent.user_id,new.user_id,'reply','reply:'||new.id::text,new.id,post.id,new.id,'replied to your comment: '||left(new.body,180),link);end if;
 else
  post:=new;link:='/community?sport='||post.sport||'&post='||post.id::text||'#post-'||post.id::text;
 end if;
 -- Exact usernames, limited to 10 distinct mentions per publication.
 for mention in select distinct lower(m[2]) from regexp_matches(new.body,'(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{3,24})\M','g') m limit 10 loop
  select user_id into recipient from public.community_profiles where lower(username)=mention and visible;
  if recipient is not null and (TG_TABLE_NAME='community_posts' or (recipient<>post.user_id and recipient is distinct from parent.user_id)) then
   perform private.emit_notification(recipient,new.user_id,'mention','mention:'||new.id::text,new.id,post.id,case when TG_TABLE_NAME='community_post_comments' then new.id else null end,'mentioned you: '||left(new.body,180),link);
  end if;
 end loop;
 return new;
end$$;
revoke all on function private.notification_social_event() from public,anon,authenticated;
create trigger notification_post after insert on public.community_posts for each row execute function private.notification_social_event();
create trigger notification_comment after insert on public.community_post_comments for each row execute function private.notification_social_event();
create trigger notification_like after insert on public.community_reactions for each row execute function private.notification_social_event();
create trigger notification_follow after insert on public.member_follows for each row execute function private.notification_social_event();
create trigger notification_share after insert on public.community_shares for each row execute function private.notification_social_event();
create trigger notification_comment_reaction after insert on public.community_comment_reactions for each row execute function private.notification_social_event();

create function private.notification_pulse(p_device uuid,p_visible boolean default true) returns void language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 insert into private.notification_presence(user_id,device,visible) values(auth.uid(),p_device,p_visible) on conflict(user_id,device) do update set last_seen=now(),visible=excluded.visible;
 delete from private.notification_presence where user_id=auth.uid() and last_seen<now()-interval '1 day';
end$$;
create function private.notification_sync_updates() returns void language plpgsql security definer set search_path='' as $$declare item public.app_updates;new_notification uuid;begin
 if auth.uid() is null then return;end if;
 perform private.emit_notification(auth.uid(),null,'welcome','welcome:'||auth.uid()::text,null,null,null,'Welcome to Vegas Quant. Your community activity and account updates live here.','/notifications');
 if not exists(select 1 from public.community_profiles where user_id=auth.uid() and visible and avatar is not null and username !~* '^Member_[a-f0-9]{8}$') then
 perform private.emit_notification(auth.uid(),null,'profile_reminder','profile:'||auth.uid()::text||':'||to_char(now(),'IYYY-IW'),null,null,null,'Finish your community profile so others recognize your posts.','/community');end if;
 for item in select * from public.app_updates where created_at>now()-interval '7 days' order by created_at desc limit 20 loop
  new_notification:=private.emit_notification(auth.uid(),null,'feature','feature:'||item.id::text,item.id,null,null,left(item.title||' · '||item.body,400),'/notifications');
  if new_notification is not null then update public.notifications n set read_at=r.read_at,viewed_at=r.read_at from public.app_update_reads r where n.id=new_notification and r.user_id=auth.uid() and r.update_id=item.id;end if;
 end loop;
end$$;
revoke all on function private.notification_pulse(uuid,boolean),private.notification_sync_updates() from public,anon;
grant execute on function private.notification_pulse(uuid,boolean),private.notification_sync_updates() to authenticated;
create function public.notification_pulse(p_device uuid,p_visible boolean default true) returns void language sql security invoker set search_path='' as $$select private.notification_pulse(p_device,p_visible)$$;
create function public.notification_sync_updates() returns void language sql security invoker set search_path='' as $$select private.notification_sync_updates()$$;
create function public.notification_counts() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('unread',count(*) filter(where read_at is null),'unviewed',count(*) filter(where viewed_at is null),'messages',count(*) filter(where read_at is null and type in ('message','group_message','message_request','message_reminder'))) from public.notifications where recipient_id=auth.uid();
$$;
create function public.notification_inbox(p_type text default null,p_search text default '',p_unread boolean default false,p_before timestamptz default null,p_id uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x) order by updated_at desc,id desc),'[]'::jsonb),'snapshot_at',now()) from (
 select * from public.notifications where recipient_id=auth.uid()
 and (not p_unread or read_at is null)
 and (p_type is null or type=p_type or (p_type='messages' and type in ('message','group_message','message_request','message_reminder')) or (p_type='system' and type in ('welcome','profile_reminder','security','password_change','account','feature','suggestion')))
 and (left(trim(p_search),100)='' or to_tsvector('simple',private.notification_search_document(actor_name,actor_names,message))@@plainto_tsquery('simple',left(p_search,100)))
 and (p_before is null or (updated_at,id)<(p_before,coalesce(p_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))) order by updated_at desc,id desc limit 40
 )x;
$$;
create function public.notification_action(p_action text,p_id uuid default null,p_before timestamptz default now()) returns void language plpgsql security invoker set search_path='' as $$begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 if p_action='read_all' then update public.notifications set read_at=now(),viewed_at=now() where recipient_id=auth.uid() and read_at is null and updated_at<=p_before;
 elsif p_action='read' then update public.notifications set read_at=now(),viewed_at=now() where id=p_id and recipient_id=auth.uid() and updated_at<=p_before;
 elsif p_action='unread' then update public.notifications set read_at=null where id=p_id and recipient_id=auth.uid() and updated_at<=p_before;
 elsif p_action='view' then update public.notifications set viewed_at=now() where id=p_id and recipient_id=auth.uid() and viewed_at is null and updated_at<=p_before;
 elsif p_action='delete' then delete from public.notifications where id=p_id and recipient_id=auth.uid() and updated_at<=p_before;
 else raise exception 'Invalid notification action';end if;
end$$;
create function public.community_comments(p_post uuid,p_target uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from (
 select c.*,(select count(*) from public.community_comment_reactions r where r.comment_id=c.id) as reactions,
 exists(select 1 from public.community_comment_reactions r where r.comment_id=c.id and r.user_id=auth.uid()) as reacted
 from public.community_post_comments c where c.post_id=p_post and (c.id in(select id from public.community_post_comments where post_id=p_post order by created_at desc limit 50) or c.id=p_target)
 ) x;
$$;
-- Trusted integration seam for future DM/group/security services. Not a client notification-creation API.
create function public.publish_system_notification(p_recipient uuid,p_type text,p_event_key text,p_message text,p_link text default '/notifications',p_actor uuid default null,p_content uuid default null) returns uuid language plpgsql security definer set search_path='' as $$begin
 if p_type not in ('message','group_message','message_request','message_reminder','security','password_change','account','profile_reminder','feature','suggestion') or length(p_event_key)>200 then raise exception 'Invalid system event';end if;
 return private.emit_notification(p_recipient,p_actor,p_type,'system:'||p_event_key,p_content,null,null,left(p_message,400),p_link);
end$$;
revoke all on function public.publish_system_notification(uuid,text,text,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.publish_system_notification(uuid,text,text,text,text,uuid,uuid) to service_role;
-- Password changes originate from Auth, never an untrusted browser event.
create function private.notification_password_change() returns trigger language plpgsql security definer set search_path='' as $$begin
 if old.encrypted_password is distinct from new.encrypted_password and old.encrypted_password<>'' and new.email_confirmed_at is not null then
 perform private.emit_notification(new.id,null,'password_change','password:'||new.id::text||':'||txid_current()::text,null,null,null,'Your Vegas Quant password was changed. If this was not you, secure your account.','/membership');end if;return new;
end$$;
revoke all on function private.notification_password_change() from public,anon,authenticated;
create trigger notification_password_change after update of encrypted_password on auth.users for each row execute function private.notification_password_change();

-- Row leases prevent two workers from claiming the same job; acknowledgments require the lease token.
create function public.claim_social_notification_deliveries() returns jsonb language plpgsql security definer set search_path='' as $$declare jobs uuid[];begin
 update private.notification_deliveries set state='dead',last_error='lease_exhausted' where state='leased' and due_at<=now() and lease_until<now() and attempts>=5;
 update private.notification_deliveries d set state='suppressed',last_error='read_disabled_or_expired'
 from public.notifications n,public.notification_preferences p where d.notification_id=n.id and p.user_id=n.recipient_id and d.state in ('pending','leased') and d.due_at<=now() and (n.read_at is not null or n.created_at<now()-case when n.priority='critical' then interval '7 days' else interval '1 day' end or n.type=any(p.disabled_types) or (d.channel='push' and not p.push_enabled) or (d.channel='email' and not p.email_enabled) or (n.actor_id is not null and exists(select 1 from public.member_blocks b where (b.user_id=n.recipient_id and b.target_user_id=n.actor_id) or (b.target_user_id=n.recipient_id and b.user_id=n.actor_id))));
 update private.notification_deliveries d set due_at=now()+interval '90 seconds' from public.notifications n where d.notification_id=n.id and d.state='pending' and d.channel='push' and n.priority<>'critical' and d.due_at<=now() and exists(select 1 from private.notification_presence p where p.user_id=n.recipient_id and p.visible and p.last_seen>now()-interval '75 seconds');
 update private.notification_deliveries d set due_at=now()+interval '30 minutes' from public.notifications n,public.notification_preferences p where d.notification_id=n.id and p.user_id=n.recipient_id and d.state='pending' and d.due_at<=now() and d.channel='push' and n.priority<>'critical' and p.quiet_enabled and (case when p.quiet_start<p.quiet_end then extract(hour from now() at time zone p.timezone)>=p.quiet_start and extract(hour from now() at time zone p.timezone)<p.quiet_end when p.quiet_start>p.quiet_end then extract(hour from now() at time zone p.timezone)>=p.quiet_start or extract(hour from now() at time zone p.timezone)<p.quiet_end else false end);
 -- Per-recipient budget applies to social pushes, never critical security/messages.
 update private.notification_deliveries d set due_at=now()+interval '1 hour' from public.notifications n where d.notification_id=n.id and d.state='pending' and d.channel='push' and n.priority<>'critical' and d.due_at<=now() and (select count(distinct sent.notification_id) from private.notification_deliveries sent join public.notifications sn on sn.id=sent.notification_id where sn.recipient_id=n.recipient_id and sent.channel='push' and sent.sent_at>now()-interval '1 hour')>=10;
 select array_agg(id) into jobs from (select d.id from private.notification_deliveries d join public.notifications n on n.id=d.notification_id where (d.state='pending' or(d.state='leased' and d.lease_until<now())) and d.due_at<=now() and d.attempts<5 and (n.actor_id is null or private.age_eligible(n.recipient_id)) order by case n.priority when 'critical' then 0 when 'high' then 1 else 2 end,d.due_at for update of d skip locked limit 25) x;
 update private.notification_deliveries set state='leased',attempts=attempts+1,lease=gen_random_uuid(),lease_until=now()+interval '2 minutes',due_at=now()+interval '2 minutes' where id=any(jobs);
 return (select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'lease',d.lease,'channel',d.channel,'notification_id',n.id,'recipient_id',n.recipient_id,'type',n.type,'priority',n.priority,'deep_link',n.deep_link,'endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth),'email',u.email)),'[]'::jsonb) from private.notification_deliveries d join public.notifications n on n.id=d.notification_id join auth.users u on u.id=n.recipient_id left join public.push_subscriptions s on s.id=d.subscription_id where d.id=any(jobs));
end$$;
create function public.finish_social_notification_delivery(p_id uuid,p_lease uuid,p_status text,p_error text default null) returns void language plpgsql security definer set search_path='' as $$begin
 if p_status not in ('sent','retry','blocked','expired','suppressed') then raise exception 'Invalid delivery status';end if;
 if p_status='expired' then delete from public.push_subscriptions where id=(select subscription_id from private.notification_deliveries where id=p_id and lease=p_lease and state='leased');return;end if;
 update private.notification_deliveries set state=case when p_status='retry' then case when attempts>=5 then 'dead' else 'pending' end else p_status end,sent_at=case when p_status='sent' then now() else null end,last_error=left(p_error,80),lease_until=null,
 due_at=now()+make_interval(secs=>least(3600,(30*power(2,attempts))::integer)) where id=p_id and lease=p_lease and state='leased';
end$$;
revoke all on function public.claim_social_notification_deliveries(),public.finish_social_notification_delivery(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_social_notification_deliveries(),public.finish_social_notification_delivery(uuid,uuid,text,text) to service_role;
revoke all on function public.notification_pulse(uuid,boolean),public.notification_sync_updates(),public.notification_counts(),public.notification_inbox(text,text,boolean,timestamptz,uuid),public.notification_action(text,uuid,timestamptz),public.community_comments(uuid,uuid) from public,anon;
grant execute on function public.notification_pulse(uuid,boolean),public.notification_sync_updates(),public.notification_counts(),public.notification_inbox(text,text,boolean,timestamptz,uuid),public.notification_action(text,uuid,timestamptz),public.community_comments(uuid,uuid) to authenticated;
revoke all on function private.notification_pref_guard() from public,anon,authenticated;
-- Realtime uses recipient RLS. Private event ledgers and delivery destinations are never published.
do $$begin if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table public.notifications;end if;end$$;

create function private.notification_block_cleanup() returns trigger language plpgsql security definer set search_path='' as $$begin
 delete from public.notifications n where (n.recipient_id=new.user_id and exists(select 1 from private.notification_events e where e.notification_id=n.id and e.actor_id=new.target_user_id)) or (n.recipient_id=new.target_user_id and exists(select 1 from private.notification_events e where e.notification_id=n.id and e.actor_id=new.user_id));return new;
end$$;
revoke all on function private.notification_block_cleanup() from public,anon,authenticated;
create trigger notification_block_cleanup after insert on public.member_blocks for each row execute function private.notification_block_cleanup();
create function public.social_notification_delivery_allowed(p_id uuid,p_lease uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.notification_deliveries d join public.notifications n on n.id=d.notification_id join public.notification_preferences p on p.user_id=n.recipient_id join auth.users u on u.id=n.recipient_id
 where d.id=p_id and d.lease=p_lease and d.state='leased' and d.lease_until>now() and n.read_at is null and n.type<>all(p.disabled_types) and u.email_confirmed_at is not null
 and (n.actor_id is null or (private.age_eligible(n.recipient_id) and not exists(select 1 from public.member_blocks b where (b.user_id=n.recipient_id and b.target_user_id=n.actor_id) or (b.target_user_id=n.recipient_id and b.user_id=n.actor_id))))
 and not exists(select 1 from private.account_erasure_jobs where user_id=n.recipient_id and expires_at>now()) and ((d.channel='push' and p.push_enabled) or (d.channel='email' and p.email_enabled)));
$$;
revoke all on function public.social_notification_delivery_allowed(uuid,uuid) from public,anon,authenticated;
grant execute on function public.social_notification_delivery_allowed(uuid,uuid) to service_role;
create function public.notification_view(p_ids uuid[],p_before timestamptz) returns void language plpgsql security invoker set search_path='' as $$begin
 if cardinality(p_ids)>40 then raise exception 'View up to forty notifications';end if;
 update public.notifications set viewed_at=now() where recipient_id=auth.uid() and id=any(p_ids) and viewed_at is null and updated_at<=p_before;
end$$;
revoke all on function public.notification_view(uuid[],timestamptz) from public,anon;
grant execute on function public.notification_view(uuid[],timestamptz) to authenticated;
-- Durable due-work trigger. No fanout or provider calls occur in a member transaction.
create function private.invoke_social_notification_dispatcher() returns void language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from private.notification_deliveries where (state='pending' or(state='leased' and lease_until<now())) and due_at<=now() and (attempts<5 or state='leased')) then
 perform net.http_post(url:='https://vegasquant.app/api/notifications/social-dispatch',headers:=jsonb_build_object('Content-Type','application/json','x-vq-dispatch',(select v.decrypted_secret from private.push_config c join vault.decrypted_secrets v on v.id=c.dispatch_secret)),body:='{}'::jsonb,timeout_milliseconds:=55000);
 end if;
end$$;
revoke all on function private.invoke_social_notification_dispatcher() from public,anon,authenticated;
-- pg_cron 1.6+ supports sub-minute schedules. Existing research delivery remains unchanged.
select cron.schedule('vq-social-notifications','10 seconds','select private.invoke_social_notification_dispatcher();');

do $$begin if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='app_updates') then alter publication supabase_realtime add table public.app_updates;end if;end$$;
create index notification_actor on public.notifications(actor_id) where actor_id is not null;
create index notification_post on public.notifications(post_id) where post_id is not null;
create index notification_comment on public.notifications(comment_id) where comment_id is not null;
create index notification_event_projection on private.notification_events(notification_id) where notification_id is not null;
create index notification_delivery_subscription on private.notification_deliveries(subscription_id) where subscription_id is not null;
create index notification_delivery_notification on private.notification_deliveries(notification_id);
create index comment_reaction_user on public.community_comment_reactions(user_id);
create index community_share_user on public.community_shares(user_id);
create function public.social_notification_health() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('queues',coalesce((select jsonb_agg(to_jsonb(x)) from(select channel,state,count(*) jobs,min(due_at) oldest_due from private.notification_deliveries group by channel,state)x),'[]'::jsonb),'unread', (select count(*) from public.notifications where read_at is null));
$$;
create function public.retry_social_notification_delivery(p_id uuid) returns void language sql security definer set search_path='' as $$
 update private.notification_deliveries set state='pending',attempts=0,lease=null,lease_until=null,due_at=now(),last_error=null where id=p_id and state in ('blocked','dead');
$$;
revoke all on function public.social_notification_health(),public.retry_social_notification_delivery(uuid) from public,anon,authenticated;
grant execute on function public.social_notification_health(),public.retry_social_notification_delivery(uuid) to service_role;
create function private.notification_email_change() returns trigger language plpgsql security definer set search_path='' as $$begin
 if old.email is distinct from new.email and old.email_confirmed_at is not null and new.email_confirmed_at is not null then perform private.emit_notification(new.id,null,'account','email-change:'||new.id::text||':'||txid_current()::text,null,null,null,'Your Vegas Quant account email was updated. Review your account if you did not make this change.','/membership');end if;return new;
end$$;
revoke all on function private.notification_email_change() from public,anon,authenticated;
create trigger notification_email_change after update of email on auth.users for each row execute function private.notification_email_change();
-- Bound source-action floods even if a client bypasses the UI or supplies old timestamps.
create table private.notification_action_rates(user_id uuid not null references auth.users on delete cascade,window_at timestamptz not null,attempts integer not null,primary key(user_id,window_at));
alter table private.notification_action_rates enable row level security;
revoke all on private.notification_action_rates from public,anon,authenticated;
create function private.notification_interaction_guard() returns trigger language plpgsql security definer set search_path='' as $$declare total integer;begin
 insert into private.notification_action_rates(user_id,window_at,attempts) values(new.user_id,date_trunc('minute',now()),1) on conflict(user_id,window_at) do update set attempts=private.notification_action_rates.attempts+1 returning attempts into total;
 if total>60 then raise exception 'Please wait before adding more reactions or follows';end if;
 delete from private.notification_action_rates where user_id=new.user_id and window_at<now()-interval '1 day';
 new.created_at:=now();return new;
end$$;
revoke all on function private.notification_interaction_guard() from public,anon,authenticated;
create trigger notification_like_rate before insert on public.community_reactions for each row execute function private.notification_interaction_guard();
create trigger notification_share_rate before insert on public.community_shares for each row execute function private.notification_interaction_guard();
create trigger notification_reaction_rate before insert on public.community_comment_reactions for each row execute function private.notification_interaction_guard();
create trigger notification_follow_rate before insert on public.member_follows for each row execute function private.notification_interaction_guard();
create index community_reactions_user on public.community_reactions(user_id);

create function private.notification_actor_erasure() returns trigger language plpgsql security definer set search_path='' as $$begin
 delete from public.notifications n where exists(select 1 from private.notification_events e where e.notification_id=n.id and e.actor_id=old.id);return old;
end$$;
revoke all on function private.notification_actor_erasure() from public,anon,authenticated;
create trigger notification_actor_erasure before delete on auth.users for each row execute function private.notification_actor_erasure();

create function private.notification_restriction_change() returns trigger language plpgsql security definer set search_path='' as $$declare recipient uuid;begin
 recipient:=case when TG_OP='DELETE' then old.user_id else new.user_id end;
 perform private.emit_notification(recipient,null,'account','community-access:'||recipient::text||':'||txid_current()::text,null,null,null,case when TG_OP='DELETE' then 'Your community posting access was restored.' else 'Your community posting access was restricted. Contact Support if you need help.' end,'/notifications');
 if TG_OP='DELETE' then return old;else return new;end if;
end$$;
revoke all on function private.notification_restriction_change() from public,anon,authenticated;
create trigger notification_restriction_change after insert or delete on private.community_restrictions for each row execute function private.notification_restriction_change();
