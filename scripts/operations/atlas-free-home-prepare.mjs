/** Offline proposal only. Restores source free content through the live gate. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import { hash } from "./atlas-schema-review.mjs";
export const FREE_DIRECTORY = "docs/atlas/free-home-review";
const lit = (s) => "'" + s.replaceAll("'", "''") + "'";
export async function freeHomeProposal(output = FREE_DIRECTORY) {
  const prep = "docs/atlas/schema-preparation/";
  const bytes = await readFile(prep + "replay-catalog.json.gz");
  if (
    hash(bytes) !==
    (await readFile(prep + "replay-catalog.sha256", "utf8")).trim()
  )
    throw Error("Replay integrity mismatch");
  const catalog = JSON.parse(gunzipSync(bytes));
  const snapshot = JSON.parse(
    await readFile(prep + "reduced-staging-snapshot.json", "utf8"),
  );
  const inventory = JSON.parse(await readFile(prep + "inventory.json", "utf8"));
  const find = (name) => {
    const f = catalog.functions.find(
      (f) => (f.name.includes(".") ? f.name : "public." + f.name) === name,
    );
    if (!f) throw Error("Missing source " + name);
    return f;
  };
  const originalFree = find("private.free_challenge_desk");
  const cols = catalog.tables
    .find((t) => t.name === "games")
    .columns.filter((c) => ["slot", "created_at"].includes(c.name));
  if (
    cols.length !== 2 ||
    cols[0].name !== "slot" ||
    cols[0].type !== "text" ||
    cols[1].name !== "created_at" ||
    cols[1].type !== "timestamp with time zone"
  )
    throw Error("Unexpected original column types/order");
  const originals = snapshot.tables
    .find((t) => t.name === "public.games")
    .columns.map((c) => c.name);
  const projection =
    "select row(" +
    originals.map((c) => 'x."' + c + '"').join(",") +
    ")::text x from public.games x";
  let assertions = await readFile(
    "scripts/operations/atlas-staging-catalog-assertions.sql",
    "utf8",
  );
  if (assertions.split("select x::text x from public.games x").length !== 2)
    throw Error("Preservation anchor changed");
  assertions = assertions.replace(
    "select x::text x from public.games x",
    projection,
  );
  const query = assertions
    .slice(assertions.indexOf("\nwith\n") + 1)
    .trim()
    .replace(/;\s*$/, "");
  const check = `do $preserved$ declare check_row record;begin for check_row in ${query} loop if check_row.result<>'PASS' then raise exception 'Free-Home preservation/isolation failure: % / %',check_row.name,check_row.detail;end if;end loop;end $preserved$;`;
  const wrapper = `CREATE OR REPLACE FUNCTION vq_private_access_stage.free_challenge_desk()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not coalesce(vq_private_access_stage.authorized(),false)
   or not coalesce(private.age_member_allowed(),false) then
  raise exception 'Isolated free Home requires the live verified-age gate' using errcode='42501';
 end if;
 return private.free_challenge_desk();
end
$function$
`;
  const adapters = [];
  for (const name of ["public.desk_data", "public.desk_data_compact"]) {
    const f = find(name);
    const needle = "private.free_challenge_desk()";
    if (f.definition.split(needle).length !== 2)
      throw Error("Exactly one source free-branch call required: " + name);
    const sql = f.definition.replace(
      needle,
      "vq_private_access_stage.free_challenge_desk()",
    );
    adapters.push({
      name,
      signature: name + "()",
      original_sha256: hash(f.definition),
      proposed_sha256: hash(sql),
      proposed_sql: sql,
      change:
        "Only the free-branch callee changes; original SQL SECURITY INVOKER and paid branch stay intact",
    });
  }
  const currentFree = inventory.functions.find(
    (f) => f.signature === "private.free_challenge_desk()",
  ).source_sha256;
  const guard = `do $free_target$ begin
 if current_user<>'postgres' or session_user<>'postgres' or current_setting('vq.review.target_ref',true) is distinct from 'caynldluziwrzmvuslzg' then raise exception 'Pinned staging executor required';end if;
 if to_regclass('vq_fixture.published_legs_preserved') is null or (select count(*) from auth.users)<>4 or exists(select 1 from auth.sessions)
 or exists(select 1 from vq_private_access_stage.private_development_owners) or exists(select 1 from vq_private_access_stage.entitlements) then raise exception 'Reviewed prepared zero-session four-user stage required';end if;
 if exists(select 1 from pg_attribute where attrelid='public.games'::regclass and attname in ('slot','created_at') and attnum>0 and not attisdropped)
 or to_regprocedure('vq_private_access_stage.free_challenge_desk()') is not null then raise exception 'Single-use free Home proposal refuses existing adaptation';end if;
 if encode(sha256(convert_to(pg_get_functiondef('private.free_challenge_desk()'::regprocedure),'UTF8')),'hex')<>${lit(currentFree)} then raise exception 'Free denial differs from approved preparation';end if;
 ${adapters.map((f) => `if encode(sha256(convert_to(pg_get_functiondef(${lit(f.signature)}::regprocedure),'UTF8')),'hex')<>${lit(f.original_sha256)} then raise exception 'Original desk source drift: ${f.name}';end if;`).join("\n")}
 end $free_target$;`;
  const parts = [
    `-- GENERATED / UNREVIEWED. Separate option-(b) proposal; NOT approved by prepare.sql sign-off.
begin;
set local lock_timeout='5s';set local statement_timeout='120s';set local search_path=pg_catalog,public;
set local vq.review.target_ref='caynldluziwrzmvuslzg';
select pg_advisory_xact_lock(hashtextextended('atlas-staging-preparation-v1',0));
${guard}
lock table public.games in access exclusive mode;
${check}
create temporary table free_home_before on commit drop as select 'public.games'::regclass::oid games_oid, 'vq_fixture.published_legs_preserved'::regclass::oid archive_oid;`,
    ...cols.map(
      (c) =>
        `alter table public.games add column "${c.name}" ${c.type}; -- Nullable, no default, no UPDATE of original rows.`,
    ),
    originalFree.definition + ";",
    `alter function private.free_challenge_desk() owner to postgres;
revoke all on function private.free_challenge_desk() from public,anon,authenticated,service_role;`,
    wrapper + ";",
    `alter function vq_private_access_stage.free_challenge_desk() owner to postgres;
revoke all on function vq_private_access_stage.free_challenge_desk() from public,anon,authenticated,service_role;
grant execute on function vq_private_access_stage.free_challenge_desk() to authenticated;`,
    ...adapters.map((f) => f.proposed_sql + ";"),
    check,
    await readFile(prep + "post-preparation-assertions.sql", "utf8"),
    `do $verify$ begin
 if (select games_oid from free_home_before)<>'public.games'::regclass::oid or (select archive_oid from free_home_before)<>'vq_fixture.published_legs_preserved'::regclass::oid then raise exception 'Preserved relation OID changed';end if;
 if encode(sha256(convert_to(pg_get_functiondef('private.free_challenge_desk()'::regprocedure),'UTF8')),'hex')<>${lit(hash(originalFree.definition))} then raise exception 'Original free definition was not restored byte-identical';end if;
 if has_function_privilege('authenticated','private.free_challenge_desk()','EXECUTE') or has_function_privilege('anon','private.free_challenge_desk()','EXECUTE') then raise exception 'Original free definer must remain internal-only';end if;
 if exists(select 1 from pg_proc where oid in ('public.desk_data()'::regprocedure,'public.desk_data_compact()'::regprocedure) and prosecdef) then raise exception 'Paid desk paths must stay invoker/RLS-bound';end if;
 if exists(select 1 from public.games where slot is not null or created_at is not null) then raise exception 'New fixture columns must remain unpopulated';end if;
 end $verify$;
commit;`,
  ];
  const sql = parts.join("\n\n") + "\n";
  const identity = await readFile(prep + "identities.sql", "utf8");
  if (
    hash(identity) !==
    "dcbc7c45a5bbac3bac5e23a1c738ac05c4b978e85f14511f1704ba373e6af197"
  )
    throw Error("Approved identity input changed");
  if (identity.split("select x::text x from public.games x").length !== 3)
    throw Error("Identity preservation anchors changed");
  const revisedIdentity = identity.replaceAll(
    "select x::text x from public.games x",
    projection,
  );
  const manifest = {
    status: "AWAITING_CLAUDE_HASH_REVIEW_NO_HOSTED_EXECUTION",
    target: "caynldluziwrzmvuslzg",
    source_sha: catalog.source_ref,
    free_home_sha256: hash(sql),
    original_free_sha256: hash(originalFree.definition),
    wrapper_sha256: hash(wrapper),
    column_source: cols,
    original_game_columns: originals,
    game_projection: projection,
    public_adaptations: adapters,
    identity_approved_original_sha256: hash(identity),
    identity_proposed_sha256: hash(revisedIdentity),
    identity_change:
      "Only two embedded games preservation queries change to the original 11-column projection. No identity, ACL, gate, temporal-window or I1 change.",
  };
  await mkdir(output, { recursive: true });
  for (const [name, content] of [
    ["free-home.sql", sql],
    ["free-home.sha256", hash(sql) + "  free-home.sql\n"],
    ["identities-after-free-home.sql", revisedIdentity],
    [
      "identities-after-free-home.sha256",
      hash(revisedIdentity) + "  identities-after-free-home.sql\n",
    ],
    ["catalog-assertions-after-free-home.sql", assertions],
    ["manifest.json", JSON.stringify(manifest, null, 2) + "\n"],
  ])
    await writeFile(output + "/" + name, content);
  return manifest;
}
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const i = process.argv.indexOf("--out");
  const m = await freeHomeProposal(
    i < 0 ? FREE_DIRECTORY : process.argv[i + 1],
  );
  console.log(
    JSON.stringify({
      free_home: m.free_home_sha256,
      identity: m.identity_proposed_sha256,
    }),
  );
}
