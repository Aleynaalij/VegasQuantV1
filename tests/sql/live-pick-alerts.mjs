// Live pick alerts: members-only fan-out through the emitter, once per pick, validated, service-only.
// Run: node tests/sql/live-pick-alerts.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;
create schema private;create schema auth;create schema cron;create schema net;create schema vault;
create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
create table private.admin_users(user_id uuid);
create table private.memberships(user_id uuid,revoked_at timestamptz,starts_at timestamptz,expires_at timestamptz);
create table private.billing_subscriptions(user_id uuid,blocked boolean,paid_until timestamptz);
create table private.age_ok(user_id uuid);
create function private.age_eligible(p uuid) returns boolean language sql as $$select exists(select 1 from private.age_ok where user_id=p)$$;
-- Production's link rule, verbatim: the migration must widen it for game pages.
create table public.notifications(id uuid primary key default gen_random_uuid(),recipient_id uuid,type text,message text,deep_link text,constraint notifications_type_check check(type in ('post')),
 constraint notifications_deep_link_check check(((deep_link ~ '^/(community|notifications|membership|account|messages|feed)([/?#]|$)'::text) AND (deep_link !~ '^//'::text))));
create table public.notification_preferences(user_id uuid primary key,disabled_types text[] default '{}',constraint notification_preferences_types_check check(disabled_types <@ array['post']));
create table private.emitted(recipient uuid,type text,key text,importance text,unique(recipient,key));
-- Stand-in emitter with the production importance line; the migration must patch it.
create function private.emit_notification(p_recipient uuid,p_actor uuid,p_type text,p_key text,p_content uuid default null,p_post uuid default null,p_comment uuid default null,p_message text default '',p_link text default '/notifications') returns uuid language plpgsql security definer set search_path='' as $$
declare importance text;
begin
 importance:=case when p_type in ('message') then 'critical' when p_type in ('comment','reply','mention','share','contributor') then 'high' else 'low' end;
 if exists(select 1 from public.notification_preferences where user_id=p_recipient and p_type=any(disabled_types)) then return null;end if;
 insert into private.emitted values(p_recipient,p_type,p_key,importance) on conflict do nothing;
 if not found then return null;end if;
 insert into public.notifications(recipient_id,type,message,deep_link) values(p_recipient,p_type,p_message,p_link);
 return gen_random_uuid();
end$$;
create table public.nba_games(id uuid primary key default gen_random_uuid(),provider_id text,slug text,tipoff timestamptz);
create table public.nba_editorial_picks(id uuid primary key default gen_random_uuid(),game_id uuid,player text,market text,direction text,line numeric,supersedes_id uuid);
create table public.sports_games(id uuid primary key default gen_random_uuid(),sport text,provider_id text,slug text,start_time timestamptz);
create table public.sports_markets(id uuid primary key default gen_random_uuid(),payload jsonb);
create table public.sports_selections(id uuid primary key default gen_random_uuid(),game_id uuid,market_id uuid);
create function cron.schedule(a text,b text,c text) returns bigint language sql as $$select 1::bigint$$;
grant usage on schema private,auth,cron,net,vault to service_role;`);
await db.exec(readFileSync("supabase/migrations/20261101100000_live_pick_alerts.sql", "utf8"));
const def = (await db.query("select pg_get_functiondef('private.emit_notification(uuid,uuid,text,text,uuid,uuid,uuid,text,text)'::regprocedure) d")).rows[0].d;
assert.ok(def.includes("'share','contributor','pick') then 'high'"), "picks are high priority");
const u = (n) => `00000000-0000-0000-0000-00000000000${n}`;
// 1 member, 2 admin, 3 paid subscriber, 4 member but not age eligible, 5 expired member, 6 unconfirmed member, 7 member who opted out.
for (const n of [1, 2, 3, 4, 5, 7]) await db.query("insert into auth.users values($1,now())", [u(n)]);
await db.query("insert into auth.users values($1,null)", [u(6)]);
for (const n of [1, 2, 3, 5, 6, 7]) await db.query("insert into private.age_ok values($1)", [u(n)]);
for (const n of [1, 4, 6, 7]) await db.query("insert into private.memberships values($1,null,now()-interval '1 day',now()+interval '1 day')", [u(n)]);
await db.query("insert into private.memberships values($1,null,now()-interval '9 days',now()-interval '1 day')", [u(5)]);
await db.query("insert into private.admin_users values($1)", [u(2)]);
await db.query("insert into private.billing_subscriptions values($1,false,now()+interval '9 days')", [u(3)]);
await db.query("insert into public.notification_preferences values($1,array['pick'])", [u(7)]);
const game = (await db.query("insert into public.sports_games(sport,provider_id,slug,start_time) values('nhl','401','bos-tor-401',now()-interval '1 hour') returning id")).rows[0].id;
const market = (await db.query(`insert into public.sports_markets(payload) values('{"market":"totals","direction":"Over","line":6.5}') returning id`)).rows[0].id;
const sel = (await db.query("insert into public.sports_selections(game_id,market_id) values($1,$2) returning id", [game, market])).rows[0].id;
const nbaGame = (await db.query("insert into public.nba_games(provider_id,slug,tipoff) values('501','uta-por-501',now()+interval '2 hours') returning id")).rows[0].id;
const future = (await db.query("insert into public.nba_editorial_picks(game_id,player,market,direction,line) values($1,'Deni Avdija','player_points','Over',23.5) returning id", [nbaGame])).rows[0].id;
// Candidates: the started NHL pick only (the NBA game hasn't tipped).
const cands = (await db.query("select public.live_pick_candidates() c")).rows[0].c;
assert.deepEqual(cands.map((c) => [c.sport, c.id, c.provider_id, c.market, c.direction, Number(c.line)]), [["nhl", sel, "401", "totals", "Over", 6.5]]);
const alert = (pick, sport = "nhl", msg = "Over 6.5 cleared (BOS 4, TOR 3, 3rd 5:12): 7 total, cleared.", link = "/nhl/games/bos-tor-401") =>
  db.query("select public.live_pick_alert($1,$2,$3,$4) n", [sport, pick, msg, link]).then((r) => r.rows[0].n);
assert.equal(await alert(sel), 3, "member, admin and subscriber; not underage, expired, unconfirmed or opted out");
const sent = (await db.query("select recipient_id,type,deep_link from public.notifications order by recipient_id")).rows;
assert.deepEqual(sent.map((r) => r.recipient_id), [u(1), u(2), u(3)]);
assert.ok(sent.every((r) => r.type === "pick" && r.deep_link === "/nhl/games/bos-tor-401"));
assert.ok((await db.query("select bool_and(importance='high') b from private.emitted")).rows[0].b);
assert.equal(await alert(sel), 0, "a pick alerts once");
assert.equal((await db.query("select public.live_pick_candidates() c")).rows[0].c.length, 0, "alerted picks leave the candidates");
// Validation: unknown or not-yet-started picks, wrong sport, bad links, empty or long text.
await assert.rejects(alert(future, "nba"), /Unknown pick/, "game not started");
await assert.rejects(alert(sel, "ncaab"), /Unknown pick/);
await assert.rejects(alert(sel, "nhl", "x", "https://evil.example/x"), /Invalid live alert/);
await assert.rejects(alert(sel, "nhl", "x", "/community"), /Invalid live alert/);
await assert.rejects(alert(sel, "nhl", " "), /Invalid live alert/);
await assert.rejects(alert(sel, "nhl", "x".repeat(201)), /Invalid live alert/);
await assert.rejects(alert(sel, "nfl"), /Invalid live alert/);
// The widened link rule still keeps everything else out.
for (const bad of ["/nba/games/../admin", "//evil.example", "/admin", "/nhl/records"])
  await assert.rejects(db.query("insert into public.notifications(recipient_id,type,message,deep_link) values($1,'pick','x',$2)", [u(1), bad]), /deep_link_check/, bad);
await db.query("insert into public.notifications(recipient_id,type,message,deep_link) values($1,'post','x','/community?post=1')", [u(1)]);
// A revised NBA pick: only the revision is a candidate, before and after it alerts; the original never alerts.
await db.query("update public.nba_games set tipoff=now()-interval '30 minutes' where id=$1", [nbaGame]);
const revised = (await db.query("insert into public.nba_editorial_picks(game_id,player,market,direction,line,supersedes_id) values($1,'Deni Avdija','player_points','Over',22.5,$2) returning id", [nbaGame, future])).rows[0].id;
const nbaIds = async () => (await db.query("select public.live_pick_candidates() c")).rows[0].c.filter((c) => c.sport === "nba").map((c) => c.id);
assert.deepEqual(await nbaIds(), [revised]);
assert.equal(await alert(revised, "nba", "Avdija O 22.5 PTS cleared.", "/nba/games/uta-por-501"), 3);
assert.deepEqual(await nbaIds(), [], "the replaced pick never resurfaces");
await assert.rejects(alert(future, "nba", "Avdija O 23.5 PTS final.", "/nba/games/uta-por-501"), /Unknown pick/);
// Clients can neither send alerts nor read candidates.
for (const role of ["anon", "authenticated"])
  for (const f of ["public.live_pick_alert(text,uuid,text,text)", "public.live_pick_candidates()"])
    assert.equal((await db.query(`select has_function_privilege('${role}','${f}','execute') p`)).rows[0].p, false, `${role} ${f}`);
assert.equal((await db.query("select has_function_privilege('service_role','public.live_pick_alert(text,uuid,text,text)','execute') p")).rows[0].p, true);
// The 'pick' type is allowed in notifications and preferences.
await db.query("insert into public.notification_preferences values($1,array['pick','post'])", [u(1)]).catch(() => db.query("update public.notification_preferences set disabled_types=array['pick','post'] where user_id=$1", [u(1)]));
console.log("live pick alerts: member-only fan-out once per pick, high priority, opt-out, validation and service-only access pass");
