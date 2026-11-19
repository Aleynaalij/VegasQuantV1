// Read ONLY the disposable reference replay. No connection creation or hosted access.
import { writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { SOURCE_REF, hash } from "./atlas-schema-review.mjs";
export async function exportPreparationEvidence(client, output) {
  const catalog = {
    source_ref: SOURCE_REF,
    origin: "DISPOSABLE_NATIVE_REPLAY_ONLY",
    functions: (
      await client.query(`select n.nspname||'.'||p.proname name,p.oid::regprocedure::text signature,
   pg_get_functiondef(p.oid) definition,p.prosrc body,p.prosecdef definer,p.provolatile volatility,
   p.prorettype::regtype::text returns,p.proretset retset,l.lanname language,
   (select jsonb_agg(jsonb_build_object('role',case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end,'privilege',a.privilege_type)) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) grants
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
   where n.nspname in ('public','private') and p.prokind='f' order by 1,2`)
    ).rows,
    tables: (
      await client.query(`select c.oid::regclass::text name,c.relrowsecurity rls,
   (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) columns,
   (select jsonb_agg(jsonb_build_object('name',conname,'kind',contype,'definition',pg_get_constraintdef(oid),'references',case when confrelid<>0 then confrelid::regclass::text end) order by conname) from pg_constraint where conrelid=c.oid) constraints,
   (select jsonb_agg(pg_get_indexdef(i.indexrelid) order by i.indexrelid::regclass::text) from pg_index i where i.indrelid=c.oid and not exists(select 1 from pg_constraint where conindid=i.indexrelid)) indexes,
   (select jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'function',pn.nspname||'.'||p.proname) order by t.tgname) from pg_trigger t join pg_proc p on p.oid=t.tgfoid join pg_namespace pn on pn.oid=p.pronamespace where t.tgrelid=c.oid and not t.tgisinternal) triggers,
   (select jsonb_agg(to_jsonb(p) order by p.policyname) from pg_policies p where p.schemaname=n.nspname and p.tablename=c.relname) policies,
   (select jsonb_agg(jsonb_build_object('role',case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end,'privilege',a.privilege_type)) from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a) grants
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' order by 1`)
    ).rows,
    views: (
      await client.query(
        `select c.oid::regclass::text name,pg_get_viewdef(c.oid,true) definition,c.reloptions options from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='v' order by 1`,
      )
    ).rows,
    enums: (
      await client.query(
        `select n.nspname||'.'||t.typname name,array_agg(e.enumlabel order by e.enumsortorder) labels from pg_type t join pg_namespace n on n.oid=t.typnamespace join pg_enum e on e.enumtypid=t.oid where n.nspname in ('public','private') group by 1 order by 1`,
      )
    ).rows,
    sequences: (
      await client.query(
        `select schemaname||'.'||sequencename name,data_type::text type,start_value,min_value,max_value,increment_by,cycle from pg_sequences where schemaname in ('public','private') order by 1`,
      )
    ).rows,
  };
  const bytes = gzipSync(JSON.stringify(catalog, null, 2) + "\n");
  await writeFile(output + "/preparation-catalog.json.gz", bytes);
  await writeFile(output + "/preparation-catalog.sha256", hash(bytes) + "\n");
}
