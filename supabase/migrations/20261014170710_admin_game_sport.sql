-- Lets the admin "Add game" form mark a game NFL or NBA (games.sport, default 'nfl').
-- Same locks as publish(): admin only, not after an official pick, not after kickoff. Audited.
create function private.set_game_sport(p_game uuid, p_sport text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admin access required'; end if;
  if p_sport not in ('nfl', 'nba') then raise exception 'Sport must be nfl or nba'; end if;
  if exists (select 1 from public.official_picks where game_id = p_game) then
    raise exception 'Game details are locked once an official pick is published';
  end if;
  update public.games set sport = p_sport where id = p_game and kickoff > now();
  if not found then raise exception 'Game not found or already started'; end if;
  insert into public.audit_events(entity, entity_id, action, detail)
  values ('game', p_game, 'SPORT', jsonb_build_object('sport', p_sport));
end $$;
revoke all on function private.set_game_sport(uuid, text) from public, anon, authenticated;
grant execute on function private.set_game_sport(uuid, text) to authenticated;

create function public.set_game_sport(p_game uuid, p_sport text) returns void
language sql security invoker set search_path = '' as $$ select private.set_game_sport(p_game, p_sport) $$;
revoke all on function public.set_game_sport(uuid, text) from public, anon;
grant execute on function public.set_game_sport(uuid, text) to authenticated;
