create or replace function private.guard_community_photo_upload() returns trigger language plpgsql security definer set search_path='' as $$
declare permit private.community_photo_uploads; upload_owner uuid;
begin
 if new.bucket_id<>'community-photos' then return new;end if;
 select * into permit from private.community_photo_uploads where path=new.name and expires_at>now() for update;
 if not found then raise exception 'Authorize the photo before uploading';end if;
 upload_owner:=permit.user_id;
 if auth.uid() is not null then
  if auth.uid()<>upload_owner or not private.community_photo_access() then raise exception 'Photo upload access unavailable';end if;
 elsif session_user<>'supabase_storage_admin' then raise exception 'Photo upload access unavailable';
 end if;
 perform 1 from auth.users where id=upload_owner and email_confirmed_at is not null for update;
 if not found or not private.age_eligible(upload_owner)
  or exists(select 1 from private.community_restrictions where user_id=upload_owner)
  or exists(select 1 from private.account_erasure_jobs where user_id=upload_owner and expires_at>now())
  or not exists(select 1 from public.community_profiles where user_id=upload_owner and visible and avatar is not null and username !~* '^Member_[a-f0-9]{8}$')
  or ((select enforced from private.age_policy where singleton) and not exists(select 1 from auth.sessions where id=permit.session_id and user_id=upload_owner and (not_after is null or not_after>now())))
 then raise exception 'Photo upload access unavailable';end if;
 if new.owner_id is distinct from upload_owner::text or new.name<>upload_owner::text||'/'||permit.post_id::text||'.jpg' then raise exception 'Invalid photo ownership';end if;
 if (select count(*) from storage.objects where bucket_id='community-photos' and owner_id=upload_owner::text and created_at>now()-interval '10 minutes')>=10 then raise exception 'Photo upload rate limit';end if;
 delete from private.community_photo_uploads where path=new.name;
 return new;
end $$;

