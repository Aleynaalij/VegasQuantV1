import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role; create schema private;
create table public.leg_market_prices(leg_key text primary key,book text,first_price numeric,first_point numeric,first_observed_at timestamptz,
 last_price numeric,last_point numeric,last_observed_at timestamptz,kickoff timestamptz);
create table public.published_legs(leg_key text,odds numeric,original_leg_key text);
create table public.leg_tails(user_id uuid,leg_key text);
create table public.saved_legs(user_id uuid,leg_key text);
create table public.push_subscriptions(id uuid primary key default gen_random_uuid(),user_id uuid);
create table private.push_deliveries(subscription_id uuid,kind text,event_key text,next_at timestamptz);`);
await db.exec(fs.readFileSync(new URL("../../supabase/migrations/20261016190000_price_move_alerts.sql", import.meta.url), "utf8"));

const rel = "1dd98df7-49cd-4a7b-813b-2ffad0a2d472";
const leg = `edge:${rel}:0`, old = `edge:${rel}:old`;
const tailer = "00000000-0000-0000-0000-000000000001", saver = "00000000-0000-0000-0000-000000000002", other = "00000000-0000-0000-0000-000000000003";
await db.exec(`insert into public.published_legs values('${leg}',-240,'${old}');
insert into public.leg_tails values('${tailer}','${leg}');
insert into public.saved_legs values('${saver}','${old}');
insert into public.push_subscriptions(user_id) values('${tailer}'),('${saver}'),('${other}');
insert into public.leg_market_prices values('${leg}','FanDuel',-245,64.5,now(),-240,64.5,now(),now()+interval '1 day');`);
const keys = async () => (await db.query("select event_key from private.push_deliveries order by event_key")).rows.map((r) => r.event_key);
const price = (p, point = 64.5) => db.exec(`update public.leg_market_prices set last_price=${p},last_point=${point} where leg_key='${leg}'`);

await price(-230); // 10 cents: below the threshold
assert.deepEqual(await keys(), []);
await price(-220, 65.5); // line moved: a different bet, never compared
assert.deepEqual(await keys(), []);
await price(-225); // 15 cents against the published -240
assert.deepEqual(await keys(), Array(2).fill(`price:${rel}:move:against:-240:-225`), "tailer and saver of the original leg, not others");
await price(-200); // same direction alerts once
assert.equal((await keys()).length, 2);
await price(-260); // 20 cents toward the pick
assert.equal((await keys()).filter((k) => k === `price:${rel}:move:toward:-240:-260`).length, 2);

// Without a published price the first tracked price is the base; nothing after kickoff.
await db.exec(`delete from private.push_deliveries; delete from private.leg_move_alerts; update public.published_legs set odds=null;`);
await price(-225);
assert.deepEqual(await keys(), Array(2).fill(`price:${rel}:move:against:-245:-225`));
await db.exec(`delete from private.push_deliveries; delete from private.leg_move_alerts; update public.leg_market_prices set kickoff=now()-interval '1 minute'`);
await price(-300);
assert.deepEqual(await keys(), []);

// A failure never blocks the price update.
await db.exec(`update public.leg_market_prices set kickoff=now()+interval '1 day'; drop table public.saved_legs;`);
await price(-110);
assert.equal((await db.query(`select last_price from public.leg_market_prices`)).rows[0].last_price, "-110");
assert.deepEqual(await keys(), []);
console.log("price-move alerts: ok");
