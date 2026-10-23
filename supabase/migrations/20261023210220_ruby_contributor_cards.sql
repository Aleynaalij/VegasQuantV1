-- RUBY-001: member-authored opinions, independent of research/model/official releases.
create table public.ruby_contributors (
 user_id uuid primary key references auth.users on delete cascade,
 brand text not null unique check(brand in ('OmaticsZone','SoDegenerate','FranksCorner','HoustonMikesHub')),
 theme text not null unique check(theme in ('orbit','diagonal','corner','skyline')),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 check ((brand,theme) in (('OmaticsZone','orbit'),('SoDegenerate','diagonal'),('FranksCorner','corner'),('HoustonMikesHub','skyline')))
);
create table public.ruby_submissions (
 id uuid primary key,
 user_id uuid not null references public.ruby_contributors(user_id) on delete cascade,
 brand text not null, theme text not null,
 submission_day date not null default (now() at time zone 'America/New_York')::date,
 sport text not null check(sport in ('NFL','NBA')),
 title text not null check(length(title) between 1 and 90),
 legs jsonb not null default '[]' check(jsonb_typeof(legs)='array' and jsonb_array_length(legs)<=20),
 note text not null default '' check(length(note)<=1000),
 photo_path text,
 sportsbook text check(length(sportsbook) between 1 and 80),
 reported_odds integer check(reported_odds between -100000 and 100000 and abs(reported_odds)>=100),
 created_at timestamptz not null default now(),
 unique(user_id,submission_day),
 check(jsonb_array_length(legs)>=2 or photo_path is not null),
 check((sportsbook is null)=(reported_odds is null))
);
create index ruby_submissions_recent on public.ruby_submissions(created_at desc,id);
create table public.ruby_daily_features (
 day date primary key default (now() at time zone 'America/New_York')::date,
 submission_id uuid not null references public.ruby_submissions on delete cascade,
 verified_odds integer not null check(verified_odds between 100 and 100000),
 sportsbook text not null check(length(sportsbook) between 1 and 80),
 source_url text not null check(source_url ~ '^https://[^[:space:]]+$'),
 observed_at timestamptz not null,
 verified_by uuid not null references auth.users,
 created_at timestamptz not null default now()
);
alter table public.ruby_contributors enable row level security;
alter table public.ruby_submissions enable row level security;
alter table public.ruby_daily_features enable row level security;
revoke all on public.ruby_contributors,public.ruby_submissions,public.ruby_daily_features from anon,authenticated;
grant select on public.ruby_contributors,public.ruby_submissions,public.ruby_daily_features to authenticated;
create function private.ruby_visible(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$select private.age_member_allowed() and private.community_member_allowed(p_user) and not exists(select 1 from private.community_restrictions where user_id=p_user)$$;
revoke all on function private.ruby_visible(uuid) from public,anon;
grant execute on function private.ruby_visible(uuid) to authenticated;
create policy ruby_contributor_read on public.ruby_contributors for select to authenticated using((select private.age_member_allowed()) and private.community_member_allowed(user_id));
create policy ruby_submission_read on public.ruby_submissions for select to authenticated using(private.ruby_visible(user_id));
create policy ruby_feature_read on public.ruby_daily_features for select to authenticated using(exists(select 1 from public.ruby_submissions r where r.id=submission_id));
-- Same private image pipeline; access to a Ruby image follows access to its card.
create policy ruby_photo_read on storage.objects for select to authenticated using(bucket_id='community-photos' and exists(select 1 from public.ruby_submissions r where r.photo_path=name));

create function private.submit_ruby(p_id uuid,p_sport text,p_title text,p_legs jsonb,p_note text,p_photo text,p_book text,p_odds integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare contributor public.ruby_contributors; existing public.ruby_submissions; leg jsonb;
begin
 if auth.uid() is null or not private.age_member_allowed() or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Sign in and complete account verification first'; end if;
 if exists(select 1 from private.community_restrictions where user_id=auth.uid()) then raise exception 'Posting is unavailable for this account';end if;
 select * into contributor from public.ruby_contributors where user_id=auth.uid() and active;
 if not found then raise exception 'Contributor access required';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,741));
 select * into existing from public.ruby_submissions where id=p_id;
 if found then
  if existing.user_id=auth.uid() and existing.sport=p_sport and existing.title=btrim(p_title) and existing.legs=p_legs and existing.note=btrim(p_note) and existing.photo_path is not distinct from p_photo and existing.sportsbook is not distinct from nullif(btrim(p_book),'') and existing.reported_odds is not distinct from p_odds then return existing.id;end if;
  raise exception 'Submission identifier already used';
 end if;
 if exists(select 1 from public.ruby_submissions where user_id=auth.uid() and submission_day=(now() at time zone 'America/New_York')::date) then raise exception 'Your daily lay is already published. Come back after midnight Eastern.';end if;
 if not exists(select 1 from public.community_profiles where user_id=auth.uid() and visible and avatar is not null and username !~ '^Member_') then raise exception 'Finish your community profile before posting';end if;
 if p_legs is null or jsonb_typeof(p_legs)<>'array' or jsonb_array_length(p_legs)>20 then raise exception 'Enter up to 20 legs';end if;
 for leg in select value from jsonb_array_elements(p_legs) loop
  if jsonb_typeof(leg)<>'string' or length(btrim(leg#>>'{}')) not between 1 and 180 then raise exception 'Each leg must be 1 to 180 characters';end if;
 end loop;
 if p_photo is not null and (p_photo<>auth.uid()::text||'/'||p_id::text||'.jpg' or not exists(select 1 from storage.objects where bucket_id='community-photos' and name=p_photo and owner_id=auth.uid()::text)) then raise exception 'Upload your own screenshot first';end if;
 insert into public.ruby_submissions(id,user_id,brand,theme,sport,title,legs,note,photo_path,sportsbook,reported_odds)
 values(p_id,auth.uid(),contributor.brand,contributor.theme,p_sport,btrim(p_title),p_legs,btrim(p_note),p_photo,nullif(btrim(p_book),''),p_odds);
 return p_id;
end $$;
create function public.submit_ruby(p_id uuid,p_sport text,p_title text,p_legs jsonb,p_note text default '',p_photo text default null,p_book text default null,p_odds integer default null) returns uuid
language sql security invoker set search_path='' as $$select private.submit_ruby(p_id,p_sport,p_title,p_legs,p_note,p_photo,p_book,p_odds)$$;
create function private.ruby_home() returns jsonb language sql stable security definer set search_path='' as $$
 select case when private.age_member_allowed() then jsonb_build_object('user_id',auth.uid(),'day',(now() at time zone 'America/New_York')::date,'contributor',(select to_jsonb(c) from public.ruby_contributors c where c.user_id=auth.uid() and c.active),'submitted',(select id from public.ruby_submissions where user_id=auth.uid() and submission_day=(now() at time zone 'America/New_York')::date),'admin',public.is_admin()) else '{}'::jsonb end
$$;
create function public.ruby_home() returns jsonb language sql stable security invoker set search_path='' as $$select private.ruby_home()$$;

-- Notifications use the existing dedup, blocking, opt-out and consent-aware push queue.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check(type in ('like','comment','reply','mention','follow','share','comment_reaction','message','group_message','message_request','message_reminder','welcome','profile_reminder','security','password_change','account','feature','suggestion','contributor'));
alter table public.notifications drop constraint notifications_deep_link_check;
alter table public.notifications add constraint notifications_deep_link_check check(deep_link ~ '^/(community|notifications|membership|account|messages|feed)([/?#]|$)' and deep_link !~ '^//');
-- Preserve the entire current emitter while adding exactly one high-priority social type.
do $$declare definition text;begin
 select pg_get_functiondef('private.emit_notification(uuid,uuid,text,text,uuid,uuid,uuid,text,text)'::regprocedure) into definition;
 if position('(''comment'',''reply'',''mention'',''share'')' in definition)=0 then raise exception 'Notification emitter changed; review integration';end if;
 execute replace(definition,'(''comment'',''reply'',''mention'',''share'')','(''comment'',''reply'',''mention'',''share'',''contributor'')');
end$$;
-- Preference constraint names can differ across earlier installations.
do $$declare c record;begin
 for c in select conname,pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='public.notification_preferences'::regclass and contype='c' loop
  if position('disabled_types' in c.definition)>0 then
   execute format('alter table public.notification_preferences drop constraint %I',c.conname);
  end if;
 end loop;
end$$;
alter table public.notification_preferences add constraint notification_preferences_types_check check(disabled_types <@ array['like','comment','reply','mention','follow','share','comment_reaction','message','group_message','message_request','message_reminder','welcome','profile_reminder','security','password_change','account','feature','suggestion','contributor']);
create function private.ruby_notify() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient record;
begin
 for recipient in select id from auth.users where email_confirmed_at is not null and id<>new.user_id loop
  perform private.emit_notification(recipient.id,new.user_id,'contributor','ruby:'||new.id::text,new.id,null,null,'published '||new.brand||'’s daily lay.','/feed?view=contributors&ruby='||new.id::text||'#ruby-'||new.id::text);
 end loop;
 return new;
end$$;
create trigger ruby_notify after insert on public.ruby_submissions for each row execute function private.ruby_notify();

create function private.feature_ruby(p_submission uuid,p_odds integer,p_book text,p_source text,p_observed timestamptz) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.age_member_allowed() or not coalesce(public.is_admin(),false) then raise exception 'Admin verification required';end if;
 if p_observed>now() or p_observed<now()-interval '30 minutes' then raise exception 'Verify a quote from the last 30 minutes';end if;
 if not exists(select 1 from public.ruby_submissions where id=p_submission and submission_day=(now() at time zone 'America/New_York')::date) then raise exception 'Choose a contributor lay published today';end if;
 insert into public.ruby_daily_features(submission_id,verified_odds,sportsbook,source_url,observed_at,verified_by) values(p_submission,p_odds,btrim(p_book),p_source,p_observed,auth.uid());
 -- One immutable feature per Eastern date; never overwrite an original ticket.
end$$;
create function public.feature_ruby(p_submission uuid,p_odds integer,p_book text,p_source text,p_observed timestamptz) returns void language sql security invoker set search_path='' as $$select private.feature_ruby(p_submission,p_odds,p_book,p_source,p_observed)$$;
revoke all on function private.submit_ruby(uuid,text,text,jsonb,text,text,text,integer),public.submit_ruby(uuid,text,text,jsonb,text,text,text,integer),private.ruby_home(),public.ruby_home(),private.feature_ruby(uuid,integer,text,text,timestamptz),public.feature_ruby(uuid,integer,text,text,timestamptz),private.ruby_notify() from public,anon;
grant execute on function private.submit_ruby(uuid,text,text,jsonb,text,text,text,integer),public.submit_ruby(uuid,text,text,jsonb,text,text,text,integer),private.ruby_home(),public.ruby_home(),private.feature_ruby(uuid,integer,text,text,timestamptz),public.feature_ruby(uuid,integer,text,text,timestamptz) to authenticated;
