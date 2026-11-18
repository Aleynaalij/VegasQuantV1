import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export async function stagingInstallSql() {
  const policy = await readFile(new URL("./private-development-policy.sql", import.meta.url), "utf8");
  const surfaces = await readFile(new URL("./private-access-stage-surfaces.sql", import.meta.url), "utf8");
  const dealer = await readFile(new URL("./private-access-stage-dealer.sql", import.meta.url), "utf8");
  const research = await readFile(new URL("./private-access-stage-research.sql", import.meta.url), "utf8");
  const preflight = await readFile(new URL("./private-access-stage-preflight.sql", import.meta.url), "utf8");
  return `
begin;
do $require_consumer_validation$
begin
  if to_regclass('public.community_posts') is not null or
    to_regprocedure('vq_fixture.allowed()') is null or
    to_regprocedure('public.age_verification_status()') is null or
    (select count(*) from supabase_migrations.schema_migrations where (version, name) in (
      ('20261115172210', 'consumer_phase1_synthetic_contract_fixture'),
      ('20261115173820', 'consumer_phase1_synthetic_age_shell')
    )) <> 2 then
    raise exception 'Private access acceptance SQL requires the consumer synthetic validation database';
  end if;
end
$require_consumer_validation$;
${preflight}
create schema vq_private_access_stage;
revoke all on schema vq_private_access_stage from public;
grant usage on schema vq_private_access_stage to authenticated;
${policy.replaceAll("private.", "vq_private_access_stage.")}
${surfaces}
${dealer}
${research}
commit;
`;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.stdout.write(await stagingInstallSql());
}
