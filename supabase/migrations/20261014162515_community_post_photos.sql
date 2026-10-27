-- Private photos inherit post visibility; no public image URLs or file overwrites.
alter table public.community_posts add column photo_path text;
alter table public.community_posts add constraint community_photo_identity check(photo_path is null or photo_path=user_id::text||'/'||id::text||'.jpg');
create unique index community_photo_path_unique on public.community_posts(photo_path) where photo_path is not null;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('community-photos','community-photos',false,5000000,array['image/jpeg']) on conflict(id) do nothing;
create function private.community_photo_access() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.age_member_allowed()
 and exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null)
 and exists(select 1 from public.community_profiles p where p.user_id=auth.uid() and p.visible and p.avatar is not null and p.username !~* '^Member_[a-f0-9]{8}$')
 and not exists(select 1 from private.community_restrictions where user_id=auth.uid())
 and not exists(select 1 from private.account_erasure_jobs where user_id=auth.uid() and expires_at>now())
$$;
revoke all on function private.community_photo_access() from public,anon;
grant execute on function private.community_photo_access() to authenticated;
create function public.community_photo_access() returns boolean language sql stable security invoker set search_path='' as $$select private.community_photo_access()$$;
revoke all on function public.community_photo_access() from public,anon;
grant execute on function public.community_photo_access() to authenticated;
create policy community_photo_insert on storage.objects for insert to authenticated with check(bucket_id='community-photos' and (storage.foldername(name))[1]=(select auth.uid())::text and (select private.community_photo_access()));
create policy community_photo_read on storage.objects for select to authenticated using(bucket_id='community-photos' and (select private.age_member_allowed()) and (owner_id=(select auth.uid())::text or exists(select 1 from public.community_posts p where p.photo_path=name)));
create policy community_photo_delete on storage.objects for delete to authenticated using(bucket_id='community-photos' and (select private.age_member_allowed()) and (owner_id=(select auth.uid())::text or (select public.is_admin())));
-- Serialize uploads with account erasure so a late upload cannot escape cleanup.
create function private.guard_community_photo_upload() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.bucket_id<>'community-photos' then return new;end if;
 perform 1 from auth.users where id=auth.uid() for update;
 if not found or not private.community_photo_access() then raise exception 'Photo upload access unavailable';end if;
 if new.owner_id is distinct from auth.uid()::text or new.name !~ ('^'||auth.uid()::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$') then raise exception 'Invalid photo ownership';end if;
 if (select count(*) from storage.objects where bucket_id='community-photos' and owner_id=auth.uid()::text and created_at>now()-interval '10 minutes')>=10 then raise exception 'Photo upload rate limit';end if;
 return new;
end $$;
revoke all on function private.guard_community_photo_upload() from public,anon,authenticated;
create trigger guard_community_photo_upload before insert on storage.objects for each row execute function private.guard_community_photo_upload();

create or replace function private.prepare_member_publication() returns trigger language plpgsql security invoker set search_path='' as $$
declare username text; begin
 if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'Sign in as the author'; end if;
 select p.username into username from public.community_profiles p where p.user_id=auth.uid() and p.visible and p.avatar is not null and p.username !~* '^Member_[a-f0-9]{8}$';
 if username is null then raise exception 'Complete and enable your community profile first'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,420));
 if TG_TABLE_NAME='community_posts' then
  if exists(select 1 from public.community_posts where user_id=auth.uid() and created_at>now()-interval '30 seconds') then raise exception 'Wait thirty seconds between posts'; end if;
  if exists(select 1 from jsonb_array_elements(new.legs) l where jsonb_typeof(l)<>'string' or length(l#>>'{}') not between 1 and 180) then raise exception 'Use up to twelve text selections'; end if;
  if new.photo_path is not null and not exists(select 1 from storage.objects where bucket_id='community-photos' and name=new.photo_path and owner_id=auth.uid()::text) then raise exception 'Upload your photo before publishing';end if;
  if new.kind='slip' and jsonb_array_length(new.legs)=0 and new.photo_path is null then raise exception 'Add at least one selection'; end if;
 else
  if exists(select 1 from public.community_post_comments where user_id=auth.uid() and created_at>now()-interval '10 seconds') then raise exception 'Wait ten seconds between comments'; end if;
 end if;
 new.author_name=username;new.created_at=now();return new;end $$;

create or replace function private.begin_account_erasure(p_user uuid,p_session uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare lease uuid;begin
 perform 1 from auth.users where id=p_user for update;
 if not found then raise exception 'Account unavailable';end if;
 if not exists(select 1 from auth.sessions where id=p_session and user_id=p_user and (not_after is null or not_after>now())) then raise exception 'Sign in again before deleting';end if;
 if exists(select 1 from private.admin_users where user_id=p_user) then raise exception 'Transfer administrator access before deleting this account';end if;
 if exists(select 1 from storage.objects where owner_id=p_user::text and bucket_id<>'community-photos') then raise exception 'Account contains storage objects requiring cleanup';end if;
 if exists(select 1 from private.billing_orders where user_id=p_user and state='pending' and checkout_id is null and created_at>now()-interval '31 minutes') then raise exception 'Checkout is initializing; wait for it to finish or expire before deleting';end if;
 insert into private.account_erasure_jobs(user_id) values(p_user) on conflict(user_id) do update set lease_id=gen_random_uuid(),ready=false,expires_at=now()+interval '10 minutes' where account_erasure_jobs.expires_at<now() returning lease_id into lease;
 if lease is null then raise exception 'Deletion is already in progress';end if;
 update public.account_deletion_requests set status='processing' where user_id=p_user and status='pending';
 return jsonb_build_object('lease',lease,'orders',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'checkout_id',checkout_id)),'[]') from private.billing_orders where user_id=p_user),'storage_paths',(select coalesce(jsonb_agg(name),'[]') from storage.objects where owner_id=p_user::text and bucket_id='community-photos'),'subscriptions',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'customer_id',customer_id,'order_id',order_id)),'[]') from private.billing_subscriptions where user_id=p_user));
end $$;

create or replace function private.authorize_account_erasure(p_user uuid,p_lease uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from storage.objects where owner_id=p_user::text) then raise exception 'Photo cleanup incomplete';end if;
 update private.account_erasure_jobs set ready=true where user_id=p_user and lease_id=p_lease and expires_at>now();
 if not found then raise exception 'Deletion authorization expired';end if;
end $$;
