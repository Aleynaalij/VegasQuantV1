-- Prepared only. Incoming contributor source links are not imported wagers or verified tickets.
begin;
create function private.normalize_kalshi_source_link(p text) returns text
language plpgsql immutable set search_path='' as $$
declare clean text; query text; part text; key text; ticker text; n integer:=0;
begin
 if p is null or length(p)=0 or length(p)>2048 or p ~ '[[:space:][:cntrl:]%]' or strpos(p,chr(92))>0 then return null;end if;
 if p !~ '^https://(www\.)?kalshi\.com/markets/kxmvecrosscategory/combo/[A-Za-z0-9_-]{1,200}(\?[^#]*)?(#.*)?$' then return null;end if;
 clean:=split_part(p,'#',1);
 query:=substring(clean from strpos(clean,'?')+1);
 foreach part in array string_to_array(query,'&') loop
  key:=split_part(part,'=',1);
  if position('ticker' in lower(key))>0 or lower(key) in ('market','event') then
   if key<>'marketTicker' then return null;end if;
   n:=n+1;ticker:=substring(part from length(key)+2);
   if ticker is null or ticker !~ '^[A-Za-z0-9_-]{1,200}$' then return null;end if;
  end if;
 end loop;
 if n<>1 then return null;end if;
 return split_part(clean,'?',1)||'?marketTicker='||ticker;
end $$;
revoke all on function private.normalize_kalshi_source_link(text) from public,anon,authenticated;
alter table public.ruby_submissions add column source_link text;
alter table public.ruby_card_revisions add column source_link text;
-- Replace only the existing minimum-content check, never a sportsbook/sport/ownership constraint.
do $$declare tab text; c record; n integer;begin
 foreach tab in array array['ruby_submissions','ruby_card_revisions'] loop
  n:=0;
  for c in select conname from pg_constraint where conrelid=('public.'||tab)::regclass and contype='c'
   and pg_get_constraintdef(oid) like '%jsonb_array_length(legs) >= 2%' and pg_get_constraintdef(oid) like '%photo_path IS NOT NULL%' loop
   execute format('alter table public.%I drop constraint %I',tab,c.conname);n:=n+1;
  end loop;
  if n<>1 then raise exception 'Content check changed; review integration';end if;
  execute format('alter table public.%I add constraint %I check(jsonb_array_length(legs)>=2 or photo_path is not null or source_link is not null)',tab,tab||'_content_source_check');
  execute format('alter table public.%I add constraint %I check(source_link is null or (private.normalize_kalshi_source_link(source_link) is not null and source_link=private.normalize_kalshi_source_link(source_link)))',tab,tab||'_source_link_check');
 end loop;
end $$;
-- Derive the new RPC from the exact installed guard-rich legacy function, preserving quota,
-- age/profile/contributor/erasure/image checks and all unchanged business rules.
do $$declare d text; next text; old text;begin
 select pg_get_functiondef('private.submit_ruby(uuid,text,text,jsonb,text,text,text,integer)'::regprocedure) into d;
 if position('>=3 then' in d)=0 then raise exception 'Three-per-Eastern-day quota required';end if;
 old:='existing.user_id=auth.uid() and';
 if position(old in d)=0 then raise exception 'Submission idempotency contract changed';end if;
 next:=replace(d,'FUNCTION private.submit_ruby(','FUNCTION private.submit_ruby_link(');
 next:=replace(next,'p_odds integer)','p_odds integer, p_source_link text)');
 next:=replace(next,'begin',E'begin\n p_source_link:=private.normalize_kalshi_source_link(p_source_link);\n if p_source_link is null then raise exception ''Invalid Kalshi source link'';end if;\n if exists(select 1 from private.account_erasure_jobs where user_id=auth.uid() and expires_at>now()) then raise exception ''Account deletion in progress'';end if;');
 next:=replace(next,old,'existing.source_link is not distinct from p_source_link and '||old);
 old:='note,photo_path,sportsbook,reported_odds)';
 if position(old in next)=0 then raise exception 'Submission insertion changed';end if;
 next:=replace(next,old,'note,photo_path,sportsbook,reported_odds,source_link)');
 old:='p_photo,nullif(btrim(p_book),''''),p_odds);';
 if position(old in next)=0 then raise exception 'Submission values changed';end if;
 next:=replace(next,old,'p_photo,nullif(btrim(p_book),''''),p_odds,p_source_link);');
 if position('FUNCTION private.submit_ruby_link(' in next)=0 or position('p_source_link text)' in next)=0 then raise exception 'New submission signature changed';end if;
 execute next;
 -- Legacy callers cannot claim idempotent success for an existing link-bearing payload.
 execute replace(d,'existing.user_id=auth.uid() and','existing.source_link is null and existing.user_id=auth.uid() and');
end $$;
create function public.submit_ruby_link(p_id uuid,p_sport text,p_title text,p_legs jsonb,p_note text,p_photo text,p_book text,p_odds integer,p_source_link text) returns uuid
language sql security invoker set search_path='' as $$select private.submit_ruby_link(p_id,p_sport,p_title,p_legs,p_note,p_photo,p_book,p_odds,p_source_link)$$;
revoke all on function private.submit_ruby_link(uuid,text,text,jsonb,text,text,text,integer,text),public.submit_ruby_link(uuid,text,text,jsonb,text,text,text,integer,text) from public,anon;
grant execute on function private.submit_ruby_link(uuid,text,text,jsonb,text,text,text,integer,text),public.submit_ruby_link(uuid,text,text,jsonb,text,text,text,integer,text) to authenticated;
-- Revisions preserve the immutable original and current source even for older editor clients.
do $$declare d text; next text; old text;begin
 select pg_get_functiondef('public.edit_ruby(uuid,integer,text,jsonb,text,text,text,integer,text)'::regprocedure) into d;
 if position('p_expected is distinct from n' in d)=0 or position('private.is_admin()' in d)=0 then raise exception 'Admin revision contract changed';end if;
 old:='submission_id,revision,edited_by)';if position(old in d)=0 then raise exception 'Revision insert changed';end if;
 d:=replace(d,old,'submission_id,revision,edited_by,source_link)');
 old:='p_submission,n+1,auth.uid());';if position(old in d)=0 then raise exception 'Revision values changed';end if;
 d:=replace(d,old,'p_submission,n+1,auth.uid(),case when latest.id is null then original.source_link else latest.source_link end);');
 execute d;
 next:=replace(d,'FUNCTION public.edit_ruby(','FUNCTION private.edit_ruby_link(');
 next:=replace(next,'p_photo text)','p_photo text, p_source_link text)');
 next:=replace(next,'begin',E'begin\n if p_source_link is not null then\n p_source_link:=private.normalize_kalshi_source_link(p_source_link);\n if p_source_link is null then raise exception ''Invalid Kalshi source link'';end if;end if;');
 next:=replace(next,'case when latest.id is null then original.source_link else latest.source_link end','p_source_link');
 if position('p_source_link text)' in next)=0 then raise exception 'New revision signature changed';end if;
 execute next;
end $$;
create function public.edit_ruby_link(p_submission uuid,p_expected integer,p_title text,p_legs jsonb,p_note text,p_sport text,p_book text,p_odds integer,p_photo text,p_source_link text) returns uuid
language sql security invoker set search_path='' as $$select private.edit_ruby_link(p_submission,p_expected,p_title,p_legs,p_note,p_sport,p_book,p_odds,p_photo,p_source_link)$$;
revoke all on function private.edit_ruby_link(uuid,integer,text,jsonb,text,text,text,integer,text,text),public.edit_ruby_link(uuid,integer,text,jsonb,text,text,text,integer,text,text) from public,anon;
grant execute on function private.edit_ruby_link(uuid,integer,text,jsonb,text,text,text,integer,text,text),public.edit_ruby_link(uuid,integer,text,jsonb,text,text,text,integer,text,text) to authenticated;
-- Append the nullable source field without changing existing view columns or visibility policies.
do $$declare d text;begin
 select rtrim(pg_get_viewdef('public.ruby_cards'::regclass,true),E';\n ') into d;
 execute 'create or replace view public.ruby_cards with(security_invoker=true) as select c.*,case when r.id is null then s.source_link else r.source_link end source_link from ('||d||') c join public.ruby_submissions s on s.id=c.id left join lateral(select id,source_link from public.ruby_card_revisions where submission_id=s.id order by revision desc limit 1) r on true';
 select pg_get_functiondef('private.ruby_home()'::regprocedure) into d;
 if position('end photo_path from public.ruby_submissions' in d)=0 then raise exception 'Result-review payload changed';end if;
 execute replace(d,'end photo_path from public.ruby_submissions','end photo_path,case when r.id is null then s.source_link else r.source_link end source_link from public.ruby_submissions');
end $$;
commit;
