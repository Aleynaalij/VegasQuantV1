-- community_posts.legs is jsonb in production; the admin publication path inserted text[] and always failed.
-- Same function otherwise (20261031145407 + 20261031152818 moved it to private).
create or replace function private.sports_publish_selection(p_market uuid,p_title text,p_why text,p_risk text) returns uuid language plpgsql security definer set search_path='' as $$
declare m public.sports_markets;g public.sports_games;s uuid;begin
 if auth.uid() is null or not private.is_admin() or not private.age_member_allowed() then raise exception 'Admin required';end if;
 select * into m from public.sports_markets where id=p_market;
 if not found then raise exception 'Unknown quote';end if;select * into g from public.sports_games where id=m.game_id;
 if now()>=m.expires_at or now()>=g.start_time or coalesce((g.payload->>'completed')::boolean,false) then raise exception 'Quote closed';end if;
 if length(trim(p_title)) not between 3 and 120 or length(trim(p_why)) not between 20 and 2000 or length(trim(p_risk)) not between 20 and 2000 then raise exception 'Analysis and risk required';end if;
 insert into public.sports_selections(game_id,market_id,title,why,risk,author_id,expires_at,sources)
 values(g.id,m.id,p_title,p_why,p_risk,auth.uid(),least(m.expires_at,g.start_time),jsonb_build_array(m.payload->'source')) returning id into s;
 insert into public.community_posts(user_id,sport,kind,title,body,legs) values(auth.uid(),g.sport,'talk',p_title,p_why||E'\n\nRisk: '||p_risk||E'\n\nQualitative editorial. FanDuel quote observed '||(m.observed_at::text)||E'\n'||(m.payload->'source'->>'url'),'[]'::jsonb);
 return s;
end $$;
revoke all on function private.sports_publish_selection(uuid,text,text,text) from public,anon,service_role;
grant execute on function private.sports_publish_selection(uuid,text,text,text) to authenticated;
