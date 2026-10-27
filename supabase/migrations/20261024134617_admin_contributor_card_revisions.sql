create table public.ruby_card_revisions (
 like public.ruby_submissions including defaults including constraints,
 submission_id uuid not null references public.ruby_submissions(id) on delete cascade,
 revision integer not null check(revision>0),
 edited_by uuid references auth.users on delete set null,
 primary key(id), unique(submission_id,revision)
);
alter table public.ruby_card_revisions enable row level security;
revoke all on public.ruby_card_revisions from anon,authenticated;
grant select on public.ruby_card_revisions to authenticated;
create policy ruby_revision_read on public.ruby_card_revisions for select to authenticated using(private.ruby_visible(user_id));
create trigger immutable_ruby_revision before update or delete on public.ruby_card_revisions for each row execute function private.immutable();
create policy ruby_revision_photo_read on storage.objects for select to authenticated using(bucket_id='community-photos' and exists(select 1 from public.ruby_card_revisions r where r.photo_path=name));
create function public.edit_ruby(p_submission uuid,p_expected integer,p_title text,p_legs jsonb,p_note text,p_sport text,p_book text,p_odds integer,p_photo text) returns uuid
language plpgsql security definer set search_path='' as $$
declare original public.ruby_submissions; latest public.ruby_card_revisions; rid uuid:=gen_random_uuid(); n integer; leg jsonb;
begin
 if not private.is_admin() then raise exception 'Verified admin required';end if;
 select * into original from public.ruby_submissions where id=p_submission for update;
 if not found then raise exception 'Card not found';end if;
 select * into latest from public.ruby_card_revisions where submission_id=p_submission order by revision desc limit 1;
 n:=coalesce(latest.revision,0);
 if p_expected is distinct from n then raise exception 'Card changed. Reload before editing.';end if;
 if jsonb_typeof(p_legs) is distinct from 'array' then raise exception 'Invalid legs';end if;
 for leg in select value from jsonb_array_elements(p_legs) loop
 if jsonb_typeof(leg)<>'string' or length(btrim(leg#>>'{}')) not between 1 and 180 then raise exception 'Each leg must be 1 to 180 characters';end if;end loop;
 if p_photo is not null and p_photo is distinct from coalesce(latest.photo_path,original.photo_path) and not exists(select 1 from storage.objects where bucket_id='community-photos' and name=p_photo and owner_id=auth.uid()::text and split_part(name,'/',1)=auth.uid()::text) then raise exception 'Upload your own replacement screenshot';end if;
 insert into public.ruby_card_revisions(id,user_id,brand,theme,submission_day,sport,title,legs,note,photo_path,sportsbook,reported_odds,submission_id,revision,edited_by)
 values(rid,original.user_id,original.brand,original.theme,original.submission_day,p_sport,coalesce(nullif(btrim(p_title),''),original.brand||'’s daily lay'),p_legs,coalesce(btrim(p_note),''),p_photo,nullif(btrim(p_book),''),p_odds,p_submission,n+1,auth.uid());
 return rid;
end $$;
revoke all on function public.edit_ruby(uuid,integer,text,jsonb,text,text,text,integer,text) from public,anon;
grant execute on function public.edit_ruby(uuid,integer,text,jsonb,text,text,text,integer,text) to authenticated;
create view public.ruby_cards with(security_invoker=true) as
select s.id,s.user_id,s.brand,s.theme,s.submission_day,coalesce(r.sport,s.sport) sport,coalesce(r.title,s.title) title,coalesce(r.legs,s.legs) legs,coalesce(r.note,s.note) note,case when r.id is null then s.photo_path else r.photo_path end photo_path,case when r.id is null then s.sportsbook else r.sportsbook end sportsbook,case when r.id is null then s.reported_odds else r.reported_odds end reported_odds,s.created_at,coalesce(r.revision,0) revision,r.created_at edited_at
from public.ruby_submissions s left join lateral(select * from public.ruby_card_revisions where submission_id=s.id order by revision desc limit 1) r on true;
grant select on public.ruby_cards to authenticated;
