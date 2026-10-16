-- Prospective grading capability only; NFL publication gates remain unchanged (sacks still unqualified).
alter table private.leg_result_contracts drop constraint leg_result_contracts_metric_check;
alter table private.leg_result_contracts add constraint leg_result_contracts_metric_check check(metric in ('rushing_yards','receiving_yards','passing_yards','receptions','def_sacks'));
alter table private.leg_result_contracts add constraint sack_half_step check(metric<>'def_sacks' or threshold*2=trunc(threshold*2));
create function private.guard_numeric_sack_contract() returns trigger language plpgsql security definer set search_path='' as $$
declare c jsonb; published timestamptz; bits text[]; amount numeric; op text; reviewed timestamptz;
begin
 if new.metric<>'def_sacks' then return new; end if;
 select x.value,r.created_at into c,published from public.candidate_releases r cross join lateral jsonb_array_elements(r.candidates) with ordinality x(value,n)
 where 'candidate:'||r.id::text||':'||x.n::text=new.leg_key;
 begin reviewed:=(c#>>'{sack_settlement_review,observed_at}')::timestamptz; exception when others then reviewed:=null; end;
 if c is null or c->>'sack_market_type' is distinct from 'numeric_total' or c->>'book' is distinct from 'FanDuel'
 or coalesce(c#>>'{sack_settlement_review,source_url}','')!~'^https://' or reviewed is null or reviewed>published
 or c->>'market' is distinct from new.market or c->>'name' is distinct from new.player or c->>'game_id' is distinct from new.game_id::text then
  raise exception 'Numeric sack contract needs exact immutable publication and pre-publication settlement review'; end if;
 bits:=regexp_match(new.market,'^Full game · (?:([0-9]+(?:[.][0-9]+)?)\+|(Over|Under) ([0-9]+(?:[.][0-9]+)?)) sacks$');
 if bits is null then raise exception 'Unsupported sack market; Yes/No is not a numeric total'; end if;
 amount:=coalesce(bits[1],bits[3])::numeric; op:=case when bits[1] is not null then 'gte' when bits[2]='Over' then 'over' else 'under' end;
 if amount<>new.threshold or op<>new.operator then raise exception 'Sack target differs from published contract'; end if;
 return new;
end $$;
revoke all on function private.guard_numeric_sack_contract() from public,anon,authenticated,service_role;
create trigger guard_numeric_sack_contract before insert on private.leg_result_contracts for each row execute function private.guard_numeric_sack_contract();
-- Older final evidence regexp could reject decimal stats. Use a literal-dot class, preserving all other checks.
do $$ declare old text; changed text; begin
 old:=pg_get_functiondef('public.finalize_editorial_leg(text,jsonb,jsonb)'::regprocedure);
 changed:=replace(replace(old,chr(92)||chr(92)||'.','[.]'),chr(92)||'.','[.]');
 if old<>changed then execute changed; end if;
end $$;
create table private.editorial_stat_correction_observations(
 id uuid primary key default gen_random_uuid(),leg_key text not null references private.leg_result_evidence(leg_key),
 original_value numeric not null,espn_value numeric not null,nflverse_value numeric not null,
 espn jsonb not null,nflverse jsonb not null,observed_at timestamptz not null default now()
);

create unique index editorial_stat_correction_dedupe on private.editorial_stat_correction_observations(leg_key,espn_value,nflverse_value,(espn->>'hash'),(nflverse->>'hash'));
alter table private.editorial_stat_correction_observations enable row level security;
revoke all on private.editorial_stat_correction_observations from public,anon,authenticated;
grant select,insert on private.editorial_stat_correction_observations to service_role;
create trigger immutable_correction_observations before update or delete on private.editorial_stat_correction_observations for each row execute function private.immutable();
create function public.observe_editorial_correction(p_key text,p_espn jsonb,p_nflverse jsonb)returns jsonb language plpgsql security invoker set search_path='' as $$
declare old private.leg_result_evidence; c private.leg_result_contracts; g public.games; ev numeric; nv numeric; wrote integer;
begin
 select * into old from private.leg_result_evidence where leg_key=p_key;
 if not found then return jsonb_build_object('recorded',false,'conflict',false); end if;
 select * into strict c from private.leg_result_contracts where leg_key=p_key;
 select * into strict g from public.games where id=c.game_id;
 if g.kickoff>now() or p_espn->>'event_id' is distinct from g.provider_id or p_espn->>'completed' is distinct from 'true'
 or p_espn->>'source_url' is distinct from 'https://www.espn.com/nfl/boxscore/_/gameId/'||g.provider_id
 or p_nflverse->>'source_url' is distinct from 'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_'||g.season::text||'.csv'
 or coalesce(p_espn->>'hash','')!~'^[a-f0-9]{64}$' or coalesce(p_nflverse->>'hash','')!~'^[a-f0-9]{64}$'
 or coalesce(p_espn->>'value','')!~'^-?[0-9]+([.][0-9]+)?$' or coalesce(p_nflverse->>'value','')!~'^-?[0-9]+([.][0-9]+)?$'
 or coalesce(p_espn->>'retrieved_at','')='' or coalesce(p_nflverse->>'retrieved_at','')=''
 or (p_espn->>'retrieved_at')::timestamptz>now() or (p_nflverse->>'retrieved_at')::timestamptz>now() then
  raise exception 'Exact final source evidence required for correction review'; end if;
 ev:=(p_espn->>'value')::numeric;nv:=(p_nflverse->>'value')::numeric;
 if c.metric='def_sacks' and (ev<0 or nv<0 or ev*2<>trunc(ev*2) or nv*2<>trunc(nv*2)) then raise exception 'Invalid defensive sack credit';end if;
 if ev=old.value and nv=old.value then return jsonb_build_object('recorded',false,'conflict',false);end if;
 insert into private.editorial_stat_correction_observations(leg_key,original_value,espn_value,nflverse_value,espn,nflverse)
 values(p_key,old.value,ev,nv,p_espn,p_nflverse)on conflict do nothing;
 get diagnostics wrote=row_count;
 return jsonb_build_object('recorded',wrote=1,'conflict',true,'result_unchanged',true);
end $$;
revoke all on function public.observe_editorial_correction(text,jsonb,jsonb)from public,anon,authenticated;
grant execute on function public.observe_editorial_correction(text,jsonb,jsonb)to service_role;
-- Preserve valid fractional credit at the final persistence boundary too.
create function private.guard_sack_result_credit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.leg_result_contracts c where c.leg_key=new.leg_key and c.metric='def_sacks')
 and (new.value<0 or new.value*2<>trunc(new.value*2)) then raise exception 'Invalid defensive sack credit'; end if;
 return new;
end $$;
revoke all on function private.guard_sack_result_credit()from public,anon,authenticated,service_role;
create trigger guard_sack_result_credit before insert on private.leg_result_evidence for each row execute function private.guard_sack_result_credit();
