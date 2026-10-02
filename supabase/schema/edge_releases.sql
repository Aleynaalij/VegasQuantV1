-- Immutable feed snapshots created atomically with official challenge publication.
create table public.edge_releases (
 id uuid not null default gen_random_uuid() unique,
 official_pick_id uuid primary key references public.official_picks(id),
 items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 3),
 created_at timestamptz not null default now()
);
alter table public.edge_releases enable row level security;
revoke all on public.edge_releases from anon,authenticated;
grant select on public.edge_releases to authenticated;
create policy member_read on public.edge_releases for select to authenticated using ((select private.has_membership()));
create trigger prevent_rewrite before update or delete on public.edge_releases for each row execute function private.immutable();
create trigger audit_change after insert on public.edge_releases for each row execute function private.audit_change();
create index edge_releases_newest on public.edge_releases(created_at desc);
create function private.capture_edge_release() returns trigger language plpgsql security invoker set search_path='' as $$
declare g public.games; extras jsonb; top_pick jsonb;
begin
 if new.stage_id is null or new.edge<3 then return new; end if;
 select * into g from public.games where id=new.game_id;
 top_pick:=jsonb_build_object('selection',new.selection,'odds',new.odds,'edge',new.edge,'model_probability',new.model_probability,'market_probability',new.market_probability,'confidence',new.confidence,'why_like',new.why_like,'why_lose',new.why_lose,'playable_number',new.playable_number,'pass_number',new.pass_number,'game_id',g.id,'slug',g.slug,'matchup',g.away_team||' @ '||g.home_team,'kickoff',g.kickoff,'source_at',new.created_at,'role','Challenge pick');
 select coalesce(jsonb_agg(x.item order by x.rank nulls last,x.edge desc,x.id),'[]'::jsonb) into extras from (
  select distinct on (t.game_id,t.selection) t.id,t.rank,t.edge,
   jsonb_build_object('selection',t.selection,'number',t.current_number,'odds',t.current_odds,'edge',t.edge,'model_probability',t.model_probability,'market_probability',t.market_probability,'confidence',t.confidence,'why_like',t.why_we_like_it,'why_lose',t.why_it_could_lose,'playable_number',t.playable_number,'pass_number',t.pass_number,'game_id',tg.id,'slug',tg.slug,'matchup',tg.away_team||' @ '||tg.home_team,'kickoff',tg.kickoff,'source_at',t.created_at,'target_id',t.id,'role','Additional edge') item
  from public.target_legs t join public.games tg on tg.id=t.game_id
  where t.status='BETTABLE' and t.edge>=3 and t.current_odds is not null and t.current_number is not null
   and t.model_probability is not null and t.market_probability is not null and t.confidence is not null
   and t.created_at<=new.created_at and tg.kickoff>new.created_at and tg.slot=g.slot
   and (tg.kickoff at time zone 'America/New_York')::date=(g.kickoff at time zone 'America/New_York')::date
   and not(t.game_id=new.game_id and lower(trim(t.selection))=lower(trim(new.selection)))
   and t.analysis_version_id=(select a.id from public.analysis_versions a where a.game_id=t.game_id and a.created_at<=new.created_at order by a.version desc limit 1)
  order by t.game_id,t.selection,t.created_at desc
 ) x;
 select coalesce(jsonb_agg(value),'[]'::jsonb) into extras from (select value from jsonb_array_elements(extras) limit 2) limited;
 insert into public.edge_releases(official_pick_id,items,created_at) values(new.id,jsonb_build_array(top_pick)||extras,new.created_at);
 return new;
end $$;
revoke all on function private.capture_edge_release() from public,anon,authenticated;
create trigger capture_edge_release after insert on public.official_picks for each row execute function private.capture_edge_release();
