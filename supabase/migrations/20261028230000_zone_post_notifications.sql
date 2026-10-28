-- Members hear about new Zone posts. Each post becomes one 'post' notification per eligible member,
-- through the existing emitter (dedup, blocks, restrictions, age gate, opt-out and push queue).
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check(type in ('like','comment','reply','mention','follow','share','comment_reaction','message','group_message','message_request','message_reminder','welcome','profile_reminder','security','password_change','account','feature','suggestion','contributor','post'));
do $$declare c record;begin
 for c in select conname,pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='public.notification_preferences'::regclass and contype='c' loop
  if position('disabled_types' in c.definition)>0 then
   execute format('alter table public.notification_preferences drop constraint %I',c.conname);
  end if;
 end loop;
end$$;
alter table public.notification_preferences add constraint notification_preferences_types_check check(disabled_types <@ array['like','comment','reply','mention','follow','share','comment_reaction','message','group_message','message_request','message_reminder','welcome','profile_reminder','security','password_change','account','feature','suggestion','contributor','post']);
-- New posts are medium priority: they push after the member's batch window, never instantly.
do $$declare definition text;begin
 select pg_get_functiondef('private.emit_notification(uuid,uuid,text,text,uuid,uuid,uuid,text,text)'::regprocedure) into definition;
 if position('(''like'',''follow'',''comment_reaction'')' in definition)=0 then raise exception 'Notification emitter changed; review integration';end if;
 execute replace(definition,'(''like'',''follow'',''comment_reaction'')','(''like'',''follow'',''comment_reaction'',''post'')');
end$$;
create function private.zone_post_notify() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient record;mentioned text[];link text;
begin
 -- Members @mentioned in the post already get a 'mention' notification for it.
 select coalesce(array_agg(distinct lower(m[2])),'{}') into mentioned from regexp_matches(coalesce(new.body,''),'(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{3,24})\M','g') m;
 link:='/community?sport='||new.sport||'&post='||new.id::text||'#post-'||new.id::text;
 for recipient in
  select u.id from auth.users u left join public.community_profiles cp on cp.user_id=u.id
  where u.email_confirmed_at is not null and u.id<>new.user_id and (cp.username is null or lower(cp.username)<>all(mentioned))
 loop
  perform private.emit_notification(recipient.id,new.user_id,'post','post:'||new.id::text,new.id,new.id,null,'posted in The Zone: '||left(coalesce(nullif(btrim(new.title),''),new.body,''),160),link);
 end loop;
 return new;
end$$;
revoke all on function private.zone_post_notify() from public,anon,authenticated;
create trigger zone_post_notify after insert on public.community_posts for each row execute function private.zone_post_notify();
