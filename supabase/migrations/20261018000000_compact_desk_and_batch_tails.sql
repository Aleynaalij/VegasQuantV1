-- Keep the complete desk RPC for game timelines and audit consumers.
-- Clone its current access/projection rules, changing only the two unbounded arrays.
do $migration$
declare original text; compact text;
begin
 original := pg_get_functiondef('public.desk_data()'::regprocedure);
 compact := replace(original, 'public.desk_data()', 'public.desk_data_compact()');
 compact := replace(compact, 'from public.market_snapshots t)',
   'from (select * from public.market_snapshots order by observed_at desc,created_at desc,id desc limit 200) t)');
 compact := replace(compact, 'from public.audit_events t)',
   'from (select * from public.audit_events order by created_at desc,id desc limit 100) t)');
 if compact = original or position('limit 200' in compact)=0 or position('limit 100' in compact)=0
 then raise exception 'Unexpected desk_data definition; refusing incomplete compact projection'; end if;
 execute compact;
end $migration$;
revoke all on function public.desk_data_compact() from public;
grant execute on function public.desk_data_compact() to anon,authenticated,service_role;

-- Aggregate only: never expose individual tail owners. Match the existing single-count guard.
create function private.leg_tail_counts(p_legs text[])
returns table(leg_key text, tail_count bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if not private.age_member_allowed() then raise exception 'Age verification required'; end if;
 if cardinality(p_legs)>150 then raise exception 'At most 150 legs per batch'; end if;
 return query
 with requested as (select distinct unnest(p_legs) as key)
 select r.key,count(t.user_id) from requested r
 left join public.leg_tails t on t.leg_key=r.key
 where r.key is not null group by r.key;
end $$;
revoke all on function private.leg_tail_counts(text[]) from public,anon;
grant execute on function private.leg_tail_counts(text[]) to authenticated,service_role;
create function public.leg_tail_counts(p_legs text[])
returns table(leg_key text, tail_count bigint)
language sql stable security invoker set search_path='' as $$
 select * from private.leg_tail_counts(p_legs);
$$;
revoke all on function public.leg_tail_counts(text[]) from public,anon;
grant execute on function public.leg_tail_counts(text[]) to authenticated,service_role;
