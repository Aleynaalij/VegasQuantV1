import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
await db.exec(`create table public.ruby_contributors (
 user_id uuid primary key, brand text unique, theme text unique, active boolean default true,
 constraint ruby_contributors_brand_check check(brand in ('OmaticsZone','SoDegenerate','FranksCorner','HoustonMikesHub')),
 constraint ruby_contributors_theme_check check(theme in ('orbit','diagonal','corner','skyline')),
 constraint ruby_contributors_check check((brand,theme) in (('OmaticsZone','orbit'),('SoDegenerate','diagonal'),('FranksCorner','corner'),('HoustonMikesHub','skyline')))
);`);
await db.exec(fs.readFileSync("supabase/migrations/20261024080046_goat_diamond_contributor.sql", "utf8"));
await db.exec(`insert into public.ruby_contributors(user_id,brand,theme) values
 ('00000000-0000-4000-8000-000000000001','The GOAT','diamond'),
 ('00000000-0000-4000-8000-000000000002','FranksCorner','corner');`);
await db.exec(fs.readFileSync("supabase/migrations/20261024190005_markkuban_contributor_template.sql", "utf8"));
await db.exec(`insert into public.ruby_contributors(user_id,brand,theme) values
 ('00000000-0000-4000-8000-000000000003','MarkKuban','marquee');`);
assert.deepEqual((await db.query("select brand,theme,active from public.ruby_contributors where brand='MarkKuban'")).rows, [{brand:"MarkKuban", theme:"marquee", active:true}]);
for (const sql of [
 "update public.ruby_contributors set theme='diamond' where brand='MarkKuban'",
 "update public.ruby_contributors set brand='Unassigned' where brand='MarkKuban'",
 "insert into public.ruby_contributors(user_id,brand,theme) values('00000000-0000-4000-8000-000000000004','MarkKuban','marquee')",
]) await assert.rejects(db.exec(sql));
assert.equal((await db.query("select count(*)::int n from public.ruby_contributors")).rows[0].n, 3);
assert.deepEqual((await db.query("select brand,theme from public.ruby_contributors where brand='The GOAT'")).rows, [{brand:"The GOAT",theme:"diamond"}]);
await db.close();
console.log("MarkKuban allowlist accepts its signature, rejects impersonation and preserves existing identities.");
