-- Owner: branded sport cards for automated MikeQ Zone publications, without republishing.
-- Publishers, quote/evidence checks, records and the original nba-threes renderer are untouched.
do $$begin
 if not exists(select 1 from private.zone_automation a join public.community_profiles p on p.user_id=a.user_id
   where a.name='nba_threes' and p.username='MikeQ') or
 (select user_id from private.zone_automation where name='sports_editorial') is distinct from
 (select user_id from private.zone_automation where name='nba_threes') then
  raise exception 'Verified MikeQ automation identity required';
 end if;
end $$;
alter table public.community_posts drop constraint community_posts_card_check;
alter table public.community_posts add constraint community_posts_card_check check(
 card is null or card ~ '^nba-threes:[0-9]{4}-[0-9]{2}-[0-9]{2}$' or card='vq-publication:v1');

-- A copyable leg comes only from a matching immutable editorial publication, never guessed prose.
create function private.zone_editorial_leg(p_id uuid,p_user uuid,p_sport text,p_title text,p_body text,p_at timestamptz)
returns text language sql stable security invoker set search_path='' as $$
 select case when length(split_part(p_body,E'\n\n',1)) between 1 and 180 then split_part(p_body,E'\n\n',1) else p_title end
 where (p_sport='nba' and exists(select 1 from public.nba_editorial_picks n
  where md5('nba-editorial-zone:'||n.publication_key)::uuid=p_id and n.published_at=p_at
   and position(n.rationale in p_body)>0 and position(n.risk in p_body)>0 and position(n.unknowns in p_body)>0))
 or (p_sport in ('nhl','ncaab') and (select count(*) from public.sports_selections s join public.sports_games g on g.id=s.game_id
  where s.author_id=p_user and g.sport=p_sport and s.title=p_title and s.published_at=p_at
   and position(s.why in p_body)>0 and position(s.risk in p_body)>0)=1)
$$;
revoke all on function private.zone_editorial_leg(uuid,uuid,text,text,text,timestamptz) from public,anon,authenticated,service_role;

create function private.attach_zone_automated_card() returns trigger language plpgsql security invoker set search_path='' as $$
declare leg text;
begin
 -- Invoker identity is the server publisher's database role, not its temporarily set JWT actor.
 -- Ordinary REST member posts (including MikeQ's own posts) remain ordinary posts.
 if current_user<>'postgres' or session_user<>'postgres' or new.card is not null then return new;end if;
 if exists(
  select 1 from private.zone_automation a join public.community_profiles p on p.user_id=a.user_id
  where a.name='nba_threes' and a.user_id=new.user_id and p.username='MikeQ'
 ) then
  new.card:='vq-publication:v1';
  if jsonb_array_length(new.legs)=0 then
   leg:=private.zone_editorial_leg(new.id,new.user_id,new.sport,new.title,new.body,new.created_at);
   if leg is not null then new.legs:=jsonb_build_array(leg);end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function private.attach_zone_automated_card() from public,anon,authenticated,service_role;
create trigger a_attach_zone_automated_card before insert on public.community_posts for each row execute function private.attach_zone_automated_card();

create or replace function private.community_post_card_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.card='vq-publication:v1' then
  if current_user<>'postgres' or session_user<>'postgres' then raise exception 'Cards are attached by Vegas Quant only';end if;
  if not exists(select 1 from private.zone_automation a join public.community_profiles p on p.user_id=a.user_id
    where a.name='nba_threes' and a.user_id=new.user_id and p.username='MikeQ') then
   raise exception 'Automated card author identity mismatch';end if;
 elsif new.card is not null and coalesce(current_setting('vq.automated_post',true),'')<>'on' then
  raise exception 'Cards are attached by Vegas Quant only';
 end if;
 return new;
end $$;

-- In-place repair only of proven editorial rows. No new posts, time changes or manual-post conversion.
update public.community_posts p set card='vq-publication:v1',
 legs=case when jsonb_array_length(p.legs)=0 then jsonb_build_array(private.zone_editorial_leg(p.id,p.user_id,p.sport,p.title,p.body,p.created_at)) else p.legs end
where p.card is null and p.user_id=(select user_id from private.zone_automation where name='nba_threes')
 and private.zone_editorial_leg(p.id,p.user_id,p.sport,p.title,p.body,p.created_at) is not null;
