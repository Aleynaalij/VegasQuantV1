-- A verified user authorizes one path before Storage performs its internal save.
create table private.community_photo_uploads(
 path text primary key, user_id uuid not null references auth.users(id) on delete cascade,
 post_id uuid not null, session_id uuid, expires_at timestamptz not null default now()+interval '5 minutes'
);
alter table private.community_photo_uploads enable row level security;
revoke all on private.community_photo_uploads from public,anon,authenticated,service_role;
create function public.begin_community_photo(p_post uuid) returns text language plpgsql security definer set search_path='' as $$
declare upload_path text;
begin
 perform 1 from auth.users where id=auth.uid() for update;
 if not found or not private.community_photo_access() or p_post is null then raise exception 'Photo upload access unavailable';end if;
 delete from private.community_photo_uploads where expires_at<now();
 upload_path:=auth.uid()::text||'/'||p_post::text||'.jpg';
 insert into private.community_photo_uploads(path,user_id,post_id,session_id)
 values(upload_path,auth.uid(),p_post,(auth.jwt()->>'session_id')::uuid)
 on conflict(path) do update set expires_at=now()+interval '5 minutes',session_id=excluded.session_id;
 return upload_path;
end $$;
revoke all on function public.begin_community_photo(uuid) from public,anon,authenticated;
grant execute on function public.begin_community_photo(uuid) to authenticated;

create or replace function private.guard_community_photo_upload() returns trigger language plpgsql security definer set search_path='' as $$
declare permit private.community_photo_uploads; owner uuid;
begin
 if new.bucket_id<>'community-photos' then return new;end if;
 select * into permit from private.community_photo_uploads where path=new.name and expires_at>now() for update;
 if not found then raise exception 'Authorize the photo before uploading';end if;
 owner:=permit.user_id;
 if auth.uid() is not null then
  if auth.uid()<>owner or not private.community_photo_access() then raise exception 'Photo upload access unavailable';end if;
 elsif session_user<>'supabase_storage_admin' then raise exception 'Photo upload access unavailable';
 end if;
 perform 1 from auth.users where id=owner and email_confirmed_at is not null for update;
 if not found or not private.age_eligible(owner)
  or exists(select 1 from private.community_restrictions where user_id=owner)
  or exists(select 1 from private.account_erasure_jobs where user_id=owner and expires_at>now())
  or not exists(select 1 from public.community_profiles where user_id=owner and visible and avatar is not null and username !~* '^Member_[a-f0-9]{8}$')
  or ((select enforced from private.age_policy where singleton) and not exists(select 1 from auth.sessions where id=permit.session_id and user_id=owner and (not_after is null or not_after>now())))
 then raise exception 'Photo upload access unavailable';end if;
 if new.owner_id is distinct from owner::text or new.name<>owner::text||'/'||permit.post_id::text||'.jpg' then raise exception 'Invalid photo ownership';end if;
 if (select count(*) from storage.objects where bucket_id='community-photos' and owner_id=owner::text and created_at>now()-interval '10 minutes')>=10 then raise exception 'Photo upload rate limit';end if;
 delete from private.community_photo_uploads where path=new.name;
 return new;
end $$;

-- Share the authoritative saved combination, only after the member taps Post to Community.
alter table public.community_posts drop constraint community_posts_legs_check;
alter table public.community_posts add constraint community_posts_legs_check check(jsonb_typeof(legs)='array');
alter table public.member_parlays add column community_post_id uuid references public.community_posts(id) on delete set null;
create function public.share_member_parlay(p_parlay uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare ticket public.member_parlays; lines jsonb:='[]'; leg jsonb; target text[]; name text; line text; post uuid;
begin
 if auth.uid() is null or not private.has_membership() or not private.community_photo_access() then raise exception 'Complete your visible community profile before sharing';end if;
 select * into ticket from public.member_parlays where id=p_parlay and user_id=auth.uid() for update;
 if not found then raise exception 'Parlay unavailable';end if;
 if ticket.community_post_id is not null then return ticket.community_post_id;end if;
 for leg in select * from jsonb_array_elements(ticket.legs) loop
  target:=regexp_match(leg->>'market','((over\s+|under\s+)?[0-9]+(\.[0-9]+)?\+?\s+((receiving|rushing|passing)\s+(yards|yds)|receptions|catches))','i');
  name:=trim(leg->>'name');
  if target is not null then line:=name||' '||target[1];
  elsif leg->>'market'='Player Prop' then line:=name;
  else raise exception 'Unsupported parlay leg';end if;
  if line is null or length(line) not between 1 and 180 then raise exception 'Invalid parlay leg';end if;
  lines:=lines||jsonb_build_array(line);
 end loop;
 insert into public.community_posts(user_id,sport,kind,title,body,legs)
 values(auth.uid(),'nfl','slip',ticket.title,'My custom parlay · Member-created combination, not a Vegas Quant recommendation.',lines) returning id into post;
 update public.member_parlays set community_post_id=post where id=ticket.id;
 return post;
end $$;
revoke all on function public.share_member_parlay(uuid) from public,anon,authenticated;
grant execute on function public.share_member_parlay(uuid) to authenticated;
