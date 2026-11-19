-- OPTIONAL ISOLATED PREPARATION ONLY. Never a production migration.
-- Run through the reviewed feature installer after the original stage gate and
-- original supported consumer schemas have been prepared with synthetic data.
create table vq_private_access_stage.feature_contract (
 singleton boolean primary key default true check(singleton),
 version text not null,
 registry jsonb not null,
 fingerprints jsonb not null default '{}',
 capabilities jsonb not null,
 original_definitions jsonb not null default '{}'
);
revoke all on vq_private_access_stage.feature_contract from public,anon,authenticated,service_role;
grant select(singleton,version,registry,fingerprints,capabilities) on vq_private_access_stage.feature_contract to authenticated;

-- Server workers keep their original permissions; this never grants a new one.
create function vq_private_access_stage.feature_allowed() returns boolean
language plpgsql stable security definer set search_path='' as $$
declare a jsonb; m jsonb; baseline jsonb;
begin
 if current_setting('role',true)='service_role' or
   (session_user='postgres' and coalesce(current_setting('role',true),'none') in ('none','postgres')) then return true; end if;
 if current_setting('role',true)<>'authenticated' or auth.uid() is null
   or not coalesce(vq_private_access_stage.authorized(),false) then return false; end if;
 select fingerprints into baseline from vq_private_access_stage.feature_contract where singleton;
 if baseline<>'{}'::jsonb and baseline is distinct from vq_private_access_stage.feature_fingerprints() then return false;end if;
 a:=public.age_verification_status();m:=public.membership_status();
 return a @> '{"synthetic":true,"verified":true}'::jsonb and m @> '{"allowed":true}'::jsonb;
end $$;
revoke all on function vq_private_access_stage.feature_allowed() from public,anon,authenticated,service_role;
grant execute on function vq_private_access_stage.feature_allowed() to authenticated,service_role;

create function vq_private_access_stage.feature_commit_guard() returns trigger
language plpgsql set search_path='' as $$
begin
 if not coalesce(vq_private_access_stage.feature_allowed(),false) then
  raise exception 'Isolated feature authorization changed; transaction rolled back' using errcode='42501';
 end if;
 return null;
end $$;
revoke all on function vq_private_access_stage.feature_commit_guard() from public,anon,authenticated,service_role;

-- Fingerprints cover original public/private functions and guarded public tables.
-- An operator change requires a new review/install, never silent capability enablement.
create function vq_private_access_stage.feature_fingerprints() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'functions',(select coalesce(jsonb_object_agg(n.nspname||'.'||p.proname||'('||pg_catalog.oidvectortypes(p.proargtypes)||')',
  jsonb_build_array(encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),p.proowner,p.proacl::text)),'{}')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private','auth') and p.prokind='f'),
 'tables',(select coalesce(jsonb_object_agg(n.nspname||'.'||c.relname,jsonb_build_object('rls',c.relrowsecurity,'owner',c.relowner,
  'acl',c.relacl::text,'force_rls',c.relforcerowsecurity,'options',c.reloptions,'kind',c.relkind,'view',case when c.relkind='v' then pg_get_viewdef(c.oid) else null end,
  'constraints',(select jsonb_agg(pg_get_constraintdef(co.oid) order by co.conname) from pg_constraint co where co.conrelid=c.oid),
  'triggers',(select jsonb_agg(jsonb_build_array(pg_get_triggerdef(tr.oid),tr.tgenabled) order by tr.tgname) from pg_trigger tr where tr.tgrelid=c.oid and not tr.tgisinternal),
  'columns',(select jsonb_agg(jsonb_build_array(a.attname,a.atttypid,a.attnotnull,a.attacl::text,a.attidentity,a.attgenerated,(select pg_get_expr(d.adbin,d.adrelid) from pg_attrdef d where d.adrelid=a.attrelid and d.adnum=a.attnum)) order by a.attnum)
   from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
  'policies',(select jsonb_agg(jsonb_build_array(p.polname,p.polpermissive,p.polroles::text,p.polcmd,
   pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname) from pg_policy p where p.polrelid=c.oid))), '{}')
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','v')))
$$;
revoke all on function vq_private_access_stage.feature_fingerprints() from public,anon,authenticated,service_role;
grant execute on function vq_private_access_stage.feature_fingerprints() to authenticated;

create function public.vq_private_access_stage_features() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare c vq_private_access_stage.feature_contract;
begin
 if not coalesce(vq_private_access_stage.feature_allowed(),false) then return null; end if;
 select version,registry,fingerprints,capabilities into c.version,c.registry,c.fingerprints,c.capabilities from vq_private_access_stage.feature_contract where singleton;
 if c.version<>'vq-stage-features-v1' or c.fingerprints is distinct from vq_private_access_stage.feature_fingerprints() then return null; end if;
 return jsonb_build_object('contract',c.version,'capabilities',c.capabilities);
end $$;
revoke all on function public.vq_private_access_stage_features() from public,anon,authenticated,service_role;
grant execute on function public.vq_private_access_stage_features() to authenticated;

-- INVOKER: original RLS, triggers, model/publication gates and function ownership
-- remain in force. This is not an administrative database proxy.
create function public.vq_private_access_stage_feature(p jsonb) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare c vq_private_access_stage.feature_contract; rule jsonb; manifest jsonb; data jsonb;
 target text; cols text; source text; predicate text:='true'; sorting text:='';
 f jsonb; col text; op text; expr text; i integer:=0; ord jsonb; payload jsonb;
 args text:=''; argdefs text:=''; argname text; argtype text; arguments jsonb;
 proc oid; keys text; updates text; n bigint; want text; result jsonb; page_sql text:='';
begin
 if not coalesce(vq_private_access_stage.feature_allowed(),false) then raise exception 'Isolated feature access denied' using errcode='42501';end if;
 if p is null or jsonb_typeof(p)<>'object' or length(p::text)>400000 then raise exception 'Invalid feature request';end if;
 manifest:=public.vq_private_access_stage_features();
 select version,registry,fingerprints,capabilities into c.version,c.registry,c.fingerprints,c.capabilities from vq_private_access_stage.feature_contract where singleton;
 if manifest is null or manifest->'capabilities'->>(p->>'group') is distinct from 'true' then raise exception 'Feature contract unavailable';end if;
 if p->>'kind'='rpc' then
  rule:=c.registry->'rpcs'->(p->>'name');
  if rule is null or rule->>'group' is distinct from p->>'group' or rule->>'write' is distinct from p->>'write' then raise exception 'Unknown feature RPC';end if;
  if p->>'write'='true' then
   if coalesce(p->>'request_id','') !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then raise exception 'Write identity required';end if;
   perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,729));
  end if;
  if p->'args' ? 'p_photo_path' and p->'args'->'p_photo_path'<>'null'::jsonb then raise exception 'Staging photo upload unavailable';end if;
  proc:=to_regprocedure('public.'||(rule->>'signature'));
  if proc is null or (select count(*) from pg_proc f join pg_namespace ns on ns.oid=f.pronamespace where ns.nspname='public' and f.proname=p->>'name')<>1 then raise exception 'Original feature RPC unavailable or ambiguous';end if;
  arguments:=p->'args';
  if jsonb_typeof(arguments) is distinct from 'object' or exists(select 1 from jsonb_object_keys(arguments) k where not (rule->'args' ? k)) then raise exception 'Unknown RPC arguments';end if;
  for argname in select jsonb_array_elements_text(rule->'args') loop
   if arguments ? argname then
    argtype:=rule->'types'->>i;
    if argtype not in ('text','uuid','uuid[]','text[]','integer','boolean','timestamp with time zone','jsonb') then raise exception 'Unreviewed argument type';end if;
    args:=concat_ws(',',nullif(args,''),format('%I => a.%I',argname,argname));
    argdefs:=concat_ws(',',nullif(argdefs,''),format('%I %s',argname,argtype));
   end if;
   i:=i+1;
  end loop;
  if rule ? 'page_columns' then
   if jsonb_typeof(p->'page') is distinct from 'object'
    or jsonb_typeof(p->'page'->'order') is distinct from 'array'
    or jsonb_array_length(p->'page'->'order')>3
    or coalesce((p->'page'->>'limit')::integer,0) not between 1 and 1000
    or coalesce((p->'page'->>'offset')::integer,-1) not between 0 and 10000
    or not (select proretset from pg_proc where oid=proc) or rule->>'write'='true' then raise exception 'Invalid RPC page';end if;
   for ord in select * from jsonb_array_elements(p->'page'->'order') loop
    col:=ord->>0;op:=coalesce(ord->>1,'asc');want:=coalesce(ord->>2,'nullslast');
    if jsonb_typeof(ord) is distinct from 'array' or jsonb_array_length(ord)>3 or not (rule->'page_columns' ? col)
     or op not in ('asc','desc') or want not in ('nullsfirst','nullslast') then raise exception 'Invalid RPC order';end if;
    sorting:=concat_ws(',',nullif(sorting,''),format('%I %s %s',col,op,case when want='nullsfirst' then 'nulls first' else 'nulls last' end));
   end loop;
   page_sql:=case when sorting<>'' then ' order by '||sorting else '' end
    ||format(' limit %s offset %s',(p->'page'->>'limit')::integer,(p->'page'->>'offset')::integer);
  elsif p ? 'page' then raise exception 'Unreviewed RPC pagination';end if;
  if args='' then source:=format('select to_jsonb(public.%I())',p->>'name');
  else source:=format('select to_jsonb(public.%I(%s)) from jsonb_to_record($1->''args'') as a(%s)',p->>'name',args,argdefs);end if;
  if (select proretset from pg_proc where oid=proc) then
   source:=case when args='' then format('select coalesce(jsonb_agg(to_jsonb(v)),''[]''::jsonb) from (select * from public.%I()%s) v',p->>'name',page_sql) else format('select coalesce(jsonb_agg(to_jsonb(v)),''[]''::jsonb) from jsonb_to_record($1->''args'') as a(%s),lateral (select * from public.%I(%s)%s) v',argdefs,p->>'name',args,page_sql) end;
  end if;
  execute source into data using p;
  if rule->>'return'='void' then data:=null;end if;
  result:=jsonb_build_object('data',data,'status',200);
 elsif p->>'kind'='table' then
  target:=p->>'name';rule:=c.registry->'tables'->target;
  if rule is null or rule->>'group' is distinct from p->>'group' or not (rule->'methods' ? (p->>'method')) then raise exception 'Unknown feature table';end if;
  if p->>'upsert'='true' and rule->>'upsert' is distinct from 'true' then raise exception 'Unreviewed upsert';end if;
  if jsonb_typeof(p->'columns') is distinct from 'array' or jsonb_array_length(p->'columns') not between 1 and 100
   or exists(select 1 from jsonb_array_elements_text(p->'columns') k where not (rule->'columns' ? k)) then raise exception 'Unknown projection';end if;
  select string_agg(format('%I',x),',') into cols from jsonb_array_elements_text(p->'columns') x;
  if jsonb_typeof(p->'filters') is distinct from 'array' or jsonb_array_length(p->'filters')>8 then raise exception 'Invalid filters';end if;
  for f in select * from jsonb_array_elements(p->'filters') loop
   col:=f->>'column';op:=f->>'op';
   if not (rule->'columns' ? col) or op not in ('eq','in','is','lt','lte','gt','gte') then raise exception 'Invalid filter';end if;
   if op='is' then
    if f->'value'<>'null'::jsonb then raise exception 'Invalid null filter';end if;
    expr:=format('t.%I is null',col);
   elsif op='in' then
    if jsonb_typeof(f->'value') is distinct from 'array' or jsonb_array_length(f->'value') not between 1 and 1000 then raise exception 'Invalid list filter';end if;
    expr:=format('t.%I in(select r.%I from jsonb_array_elements($1->''filters''->%s->''value'') v, lateral jsonb_populate_record(null::public.%I,jsonb_build_object(%L,v)) r)',col,col,i,target,col);
   else
    want:=case op when 'eq' then '=' when 'lt' then '<' when 'lte' then '<=' when 'gt' then '>' else '>=' end;
    expr:=format('t.%I %s (select r.%I from jsonb_populate_record(null::public.%I,jsonb_build_object(%L,$1->''filters''->%s->''value'')) r)',col,want,col,target,col,i);
   end if;
   predicate:=predicate||' and '||expr;i:=i+1;
  end loop;
  if jsonb_typeof(p->'order') is distinct from 'array' or jsonb_array_length(p->'order')>3 then raise exception 'Invalid order';end if;
  for ord in select * from jsonb_array_elements(p->'order') loop
   col:=ord->>0;op:=coalesce(ord->>1,'asc');want:=ord->>2;
   if not (rule->'columns' ? col) or op not in ('asc','desc') or coalesce(want,'nullslast') not in ('nullsfirst','nullslast') then raise exception 'Invalid order';end if;
   sorting:=concat_ws(',',nullif(sorting,''),format('%I %s %s',col,op,case when want='nullsfirst' then 'nulls first' else 'nulls last' end));
  end loop;
  if (p->>'limit')::integer not between 1 and 1000 or (p->>'offset')::integer not between 0 and 10000 then raise exception 'Invalid page bounds';end if;
  if p->>'method'='GET' then
   execute format('select count(*) from public.%I t where %s',target,predicate) into n using p;
   source:=format('select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from (select %s from public.%I t where %s %s limit %s offset %s) x',cols,target,predicate,
    case when sorting<>'' then 'order by '||sorting else '' end,(p->>'limit')::integer,(p->>'offset')::integer);
   execute source into data using p;
  else
   if p->>'write' is distinct from 'true' or coalesce(p->>'request_id','') !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then raise exception 'Write identity required';end if;
   payload:=p->'body';
   if jsonb_typeof(payload) is distinct from 'object' or exists(select 1 from jsonb_object_keys(payload) k where not (rule->'write' ? k)) then raise exception 'Unknown write fields';end if;
   if payload ? 'updated_at' then payload:=jsonb_set(payload,'{updated_at}',to_jsonb(statement_timestamp()));end if;
   if payload ? 'photo_path' and payload->'photo_path'<>'null'::jsonb then raise exception 'Staging photo upload unavailable';end if;
   if payload ? 'user_id' and payload->>'user_id' is distinct from auth.uid()::text then raise exception 'Author impersonation denied' using errcode='42501';end if;
   perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,729));
   if p->>'method'='POST' then
    if rule->'write' ? 'id' and not (payload ? 'id') then payload:=payload||jsonb_build_object('id',p->>'request_id');end if;
    if payload='{}'::jsonb then raise exception 'Empty insert';end if;
    select string_agg(format('%I',k),',') into keys from jsonb_object_keys(payload) k;
    source:=format('insert into public.%I as t (%s) select %s from jsonb_populate_record(null::public.%I,$2) r',target,keys,keys,target);
    if p->>'upsert'='true' then
     select string_agg(format('%I',k),',') into updates from jsonb_array_elements_text(rule->'key') k;
     source:=source||' on conflict ('||updates||') ';
     if p->>'ignore_duplicates'='true' then source:=source||'do nothing';
     else
      select string_agg(format('%I=excluded.%I',k,k),',') into updates from jsonb_object_keys(payload) k where not (rule->'key' ? k);
      source:=source||case when updates is null then 'do nothing' else 'do update set '||updates end;
     end if;
    end if;
   elsif p->>'method'='PATCH' then
    if predicate='true' or payload='{}'::jsonb then raise exception 'Bounded update required';end if;
    select string_agg(format('%I=r.%I',k,k),',') into updates from jsonb_object_keys(payload) k;
    source:=format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$2) r where %s',target,updates,target,predicate);
   elsif p->>'method'='DELETE' then
    if predicate='true' then raise exception 'Bounded delete required';end if;
    source:=format('delete from public.%I t where %s',target,predicate);
   else raise exception 'Unsupported mutation';end if;
   select string_agg(format('t.%I',x),',') into cols from jsonb_array_elements_text(p->'columns') x;
   source:=format('with changed as (%s returning %s) select coalesce(jsonb_agg(to_jsonb(changed)),''[]''::jsonb) from changed',source,cols);
   execute source into data using p,payload;
   n:=jsonb_array_length(data);
  end if;
  if p->>'single'='true' then
   if jsonb_array_length(data)<>1 then
    if p->>'write'='true' then raise exception 'Expected exactly one changed row; rollback';end if;
    if not coalesce(vq_private_access_stage.feature_allowed(),false) then raise exception 'Eligibility changed' using errcode='42501';end if;
    return jsonb_build_object('status',406,'data',jsonb_build_object('code','PGRST116','message','Expected exactly one visible row'));end if;
   data:=data->0;
  end if;
  result:=jsonb_build_object('status',200,'data',case when p->>'representation'='true' then data else null end,'count',n);
 else raise exception 'Unknown feature kind';end if;
 -- Any in-transaction eligibility change aborts the original mutation too.
 if not coalesce(vq_private_access_stage.feature_allowed(),false) then raise exception 'Isolated eligibility changed; rollback' using errcode='42501';end if;
 return result;
end $$;
revoke all on function public.vq_private_access_stage_feature(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.vq_private_access_stage_feature(jsonb) to authenticated;
