-- An explicit parlay is one immutable publication key, distinct from its individual targets.
do $$declare v text;begin
 select pg_get_viewdef('public.published_legs'::regclass,true)into v;
 v:=replace(v,'WHEN (c.value ->> ''fun_play''::text) = ''true''::text THEN ''HAIL_MARY''::text','WHEN (c.value ->> ''parlay''::text) = ''true''::text THEN ''PARLAY''::text WHEN (c.value ->> ''fun_play''::text) = ''true''::text THEN ''HAIL_MARY''::text');
 if position('''PARLAY'''in v)=0 then raise exception 'View pattern changed';end if;
 execute 'create or replace view public.published_legs with(security_invoker=true)as '||v;
end $$;
create table private.editorial_parlay_results(
 leg_key text primary key,leaf_results jsonb not null,created_at timestamptz not null default now()
);
alter table private.editorial_parlay_results enable row level security;
create policy no_member_parlay_evidence on private.editorial_parlay_results for all to anon,authenticated using(false)with check(false);
create trigger immutable_parlay_result before update or delete on private.editorial_parlay_results for each row execute function private.immutable();
create function private.complete_editorial_parlay()returns trigger language plpgsql security definer set search_path='' as $$
declare ticket record;n integer;wins integer;losses integer;sources text[];facts jsonb;outcome text;begin
 for ticket in select 'candidate:'||r.id::text||':'||c.ordinality::text leg_key,c.value
 from public.candidate_releases r cross join lateral jsonb_array_elements(r.candidates)with ordinality c(value,ordinality)
 where c.value->>'parlay'='true' and c.value->'leg_keys' ? new.leg_key loop
 perform pg_advisory_xact_lock(hashtextextended(ticket.leg_key,0));
 if exists(select 1 from public.research_leg_results where leg_key=ticket.leg_key)then continue;end if;
 if jsonb_array_length(ticket.value->'leg_keys')not between 2 and 12 then continue;end if;
 select count(*),count(*)filter(where result='WIN'),count(*)filter(where result='LOSS'),array_agg(source_url),jsonb_agg(jsonb_build_object('leg_key',r.leg_key,'result',r.result,'source',r.source_url))into n,wins,losses,sources,facts
 from public.research_leg_results r where ticket.value->'leg_keys'?r.leg_key;
 if losses>0 then outcome:='LOSS';elsif wins=jsonb_array_length(ticket.value->'leg_keys')then outcome:='WIN';else continue;end if;
 insert into private.editorial_parlay_results(leg_key,leaf_results)values(ticket.leg_key,facts)on conflict do nothing;
 insert into public.research_leg_results(leg_key,result,source_url)values(ticket.leg_key,outcome,sources[1])on conflict do nothing;
 end loop;return new;end $$;
revoke all on function private.complete_editorial_parlay() from public,anon,authenticated;
create trigger editorial_parlay_completion after insert on public.research_leg_results for each row execute function private.complete_editorial_parlay();
