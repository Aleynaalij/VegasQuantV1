import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
export async function stageFeatureCatalogSql() {
  const source = await readFile(
    new URL("./private-access-stage-features.sql", import.meta.url),
    "utf8",
  );
  const match =
    /create function vq_private_access_stage[.]feature_fingerprints\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/.exec(
      source,
    );
  if (!match) throw Error("Catalog contract missing");
  return match[1].trim();
}
/** Requires a separately reviewed pre-install catalog, never captured/blessed during install. */
export async function stageFeatureInstallSql({ reviewedCatalog } = {}) {
  if (
    !reviewedCatalog ||
    typeof reviewedCatalog !== "object" ||
    !reviewedCatalog.functions ||
    !reviewedCatalog.tables
  )
    throw Error(
      "A separately reviewed original security catalog is required before isolated installation",
    );
  const catalogSql = await stageFeatureCatalogSql();
  const expectedCatalog =
    "'" + JSON.stringify(reviewedCatalog).replaceAll("'", "''") + "'::jsonb";
  const registry = JSON.parse(
    await readFile(
      new URL("../../src/lib/stage-feature-registry.json", import.meta.url),
      "utf8",
    ),
  );
  const source = await readFile(
    new URL("./private-access-stage-features.sql", import.meta.url),
    "utf8",
  );
  return `begin;
 do $isolated$ begin
 if current_user<>'postgres' or session_user<>'postgres'
  or to_regprocedure('vq_private_access_stage.authorized()') is null
  or to_regprocedure('vq_fixture.allowed()') is null
  or to_regclass('vq_private_access_stage.entitlements') is null
  or (select count(*) from supabase_migrations.schema_migrations where (version,name) in
   (('20261115172210','consumer_phase1_synthetic_contract_fixture'),('20261115173820','consumer_phase1_synthetic_age_shell')))<>2 then
  raise exception 'Feature preparation requires the installed isolated synthetic gate';end if;
 if to_regclass('vq_private_access_stage.feature_contract') is not null then raise exception 'Feature contract already installed; review drift or rollback explicitly';end if;
 if exists(select 1 from pg_proc where oid in ('public.age_verification_status()'::regprocedure,'public.membership_status()'::regprocedure) and prosecdef) then raise exception 'Feature gate requires isolated invoker eligibility projections';end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and (c.relkind in ('m','f') or (c.relkind='v' and (not coalesce(c.reloptions @> array['security_invoker=true'],false) or c.relowner<>'postgres'::regrole))) and (has_table_privilege('authenticated',c.oid,'SELECT') or has_table_privilege('anon',c.oid,'SELECT'))) then raise exception 'Unreviewed direct feature view';end if;
 if to_regclass('storage.buckets') is not null then
  if exists(select 1 from storage.buckets) then raise exception 'Staging storage must remain empty; original SVG/PNG rendering uses reviewed source records';end if;
 end if;
 if exists(select 1 from pg_publication_tables where pubname='supabase_realtime') then raise exception 'Staging realtime must remain disabled';end if;
 if exists(select 1 from pg_extension where extname in ('pg_net','http','dblink')) then raise exception 'Outbound extensions must be isolated before feature preparation';end if;
 if to_regclass('cron.job') is not null then
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='cron') then
   raise exception 'Review scheduler isolation before consumer preparation';end if;
 end if;
 if exists(select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid join pg_namespace n on n.oid=p.pronamespace
  where not t.tgisinternal and n.nspname in ('public','private') and (case when p.prokind='f' then pg_get_functiondef(p.oid) else '' end) ~* '(net[.]http_|http_post\\s*\\(|http_get\\s*\\(|dblink\\s*\\(|pg_notify\\s*\\()') then
  raise exception 'Unreviewed outbound trigger';end if;
 if (${catalogSql}) is distinct from ${expectedCatalog} then
  raise exception 'Original security catalog drifted from the separately reviewed pre-install artifact';end if;
 end $isolated$;
 ${source}
 insert into vq_private_access_stage.feature_contract(version,registry,capabilities)
 values('vq-stage-features-v1',$registry$${JSON.stringify(registry)}$registry$::jsonb,
 '{"social":false,"profile":false,"desk":false,"notifications":false,"research":false}');
 do $$begin if to_regclass('public.notification_preferences') is not null then alter table public.notification_preferences add constraint stage_no_external_delivery check(not push_enabled and not email_enabled);end if;end$$;
 -- Never change original grants, permissive policies or function identity OIDs.
 do $guard$ declare f record; definition text; body text; suffix text; r record; original jsonb:='{}';begin
 for f in select p.*,n.nspname,l.lanname from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
  where n.nspname in ('public','private') and p.prokind='f' and p.prosecdef
  and (has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('anon',p.oid,'EXECUTE')) loop
  if f.proowner<>'postgres'::regrole then raise exception 'Unsafe isolated definer owner: %.%',f.nspname,f.proname;end if;
  definition:=pg_get_functiondef(f.oid);
  original:=original||jsonb_build_object(f.oid::regprocedure::text,definition);
  if f.lanname='plpgsql' then
   body:='begin if not coalesce(vq_private_access_stage.feature_allowed(),false) then raise exception ''Isolated feature denied'' using errcode=''42501'';end if;'
    ||E'\\n'||rtrim(f.prosrc)||case when right(rtrim(f.prosrc),1)=';' then '' else ';' end||E'\\nend';
  elsif f.lanname='sql' and f.provolatile in ('s','i') and f.prorettype<>'trigger'::regtype and (f.prorettype<>'record'::regtype or f.proretset) then
   suffix:=regexp_replace(btrim(f.prosrc),';\\s*$','');
   if position(';' in suffix)>0 then raise exception 'Unreviewed multi-statement SQL definer %',f.proname;end if;
   if f.proretset then body:='select * from ('||suffix||') original where (select vq_private_access_stage.feature_allowed())';
   else body:='select case when vq_private_access_stage.feature_allowed() then ('||suffix||') else null end';end if;
  else raise exception 'Unreviewed definer shape: %.%',f.nspname,f.proname;end if;
  -- Preserve attributes, signature, owner, grants and OID using CREATE OR REPLACE.
  execute left(definition,strpos(definition,'AS $function$')-1)||'AS '||quote_literal(body);
 end loop;
 update vq_private_access_stage.feature_contract set original_definitions=original where singleton;
 for r in select c.oid,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' loop
  if (select relowner from pg_class where oid=r.oid) <> 'postgres'::regrole then raise exception 'Unsafe isolated table owner: %',r.relname;end if;
  if not r.relrowsecurity then raise exception 'Original feature table lacks RLS: %',r.relname;end if;
  execute format('create policy stage_consumer_gate on public.%I as restrictive to authenticated,anon using ((select vq_private_access_stage.feature_allowed())) with check ((select vq_private_access_stage.feature_allowed()))',r.relname);
  execute format('create constraint trigger stage_consumer_commit after insert or update or delete on public.%I deferrable initially deferred for each row execute function vq_private_access_stage.feature_commit_guard()',r.relname);
 end loop;
 -- Definer side effects in private tables also roll back if interactive eligibility
 -- changes before commit. Do not grant the caller access to those private tables.
 for r in select c.oid,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relkind='r' loop
  if (select relowner from pg_class where oid=r.oid)<>'postgres'::regrole then raise exception 'Unsafe isolated private table owner: %',r.relname;end if;
  if has_table_privilege('authenticated',r.oid,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('anon',r.oid,'SELECT,INSERT,UPDATE,DELETE') then
   if not r.relrowsecurity then raise exception 'Readable private source lacks original RLS: %',r.relname;end if;
   execute format('create policy stage_consumer_gate on private.%I as restrictive to authenticated,anon using ((select vq_private_access_stage.feature_allowed())) with check ((select vq_private_access_stage.feature_allowed()))',r.relname);
  end if;
  execute format('create constraint trigger stage_consumer_commit after insert or update or delete on private.%I deferrable initially deferred for each row execute function vq_private_access_stage.feature_commit_guard()',r.relname);
 end loop;
 end $guard$;
 -- Activate only complete groups with original reviewed signatures and source
 -- hashes. Missing contracts stay unavailable; no content or schema is invented.
 do $activate$ declare c record; g text; ok boolean; item record; f oid; olddef text; expected text;begin
 select * into c from vq_private_access_stage.feature_contract where singleton;
 foreach g in array array['social','profile','desk','notifications','research'] loop
  ok:=true;
  for item in select * from jsonb_each(c.registry->'tables') where value->>'group'=g loop
   if to_regclass('public.'||item.key) is null then ok:=false;
   elsif exists(select 1 from jsonb_array_elements_text(item.value->'columns') col where not exists(select 1 from pg_attribute where attrelid=to_regclass('public.'||item.key) and attname=col and attnum>0 and not attisdropped)) then ok:=false;end if;
  end loop;
  for item in select jsonb_array_elements_text(coalesce(c.registry->'requirements'->g,'[]')) as key loop
   if to_regclass(item.key) is null then ok:=false;end if;
  end loop;
  for item in select * from jsonb_each(c.registry->'rpcs') where value->>'group'=g loop
   f:=to_regprocedure('public.'||(item.value->>'signature'));
   if f is null or (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=item.key)<>1 then ok:=false;else
    olddef:=c.original_definitions->>(f::regprocedure::text);
    expected:=encode(sha256(convert_to(coalesce(olddef,pg_get_functiondef(f)),'UTF8')),'hex');
    if expected is distinct from item.value->>'source_hash' then ok:=false;end if;
   end if;
  end loop;
  update vq_private_access_stage.feature_contract set capabilities=jsonb_set(capabilities,array[g],to_jsonb(ok)) where singleton;
 end loop;
 end $activate$;
 update vq_private_access_stage.feature_contract set fingerprints=vq_private_access_stage.feature_fingerprints() where singleton;
 commit;`;
}
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  if (process.argv.includes("--catalog-query"))
    process.stdout.write(await stageFeatureCatalogSql());
  else {
    const index = process.argv.indexOf("--reviewed-catalog");
    if (index < 0 || !process.argv[index + 1])
      throw Error(
        "Supply --reviewed-catalog FILE after independent original-schema review; no automatic live-baseline acceptance",
      );
    const reviewedCatalog = JSON.parse(
      await readFile(process.argv[index + 1], "utf8"),
    );
    process.stdout.write(await stageFeatureInstallSql({ reviewedCatalog }));
  }
}
