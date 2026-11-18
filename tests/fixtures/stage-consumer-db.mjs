import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { stageFeatureInstallSql } from "../../scripts/operations/private-access-stage-feature-install.mjs";
export const id = (n) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export async function consumerDb() {
  const db = new PGlite();
  const migration = async (file) =>
    db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema private;create schema vq_fixture;create schema vq_private_access_stage;create schema supabase_migrations;
 grant usage on schema auth,private,vq_fixture,vq_private_access_stage to authenticated;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('sub',auth.uid(),'aal',current_setting('test.aal',true),'session_id',current_setting('test.session',true))$$;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,encrypted_password text,banned_until timestamptz,created_at timestamptz default now());
 insert into auth.users(id,email,email_confirmed_at) select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'synthetic-'||n||'@example.test',now() from generate_series(1,3)n;
 -- Explicit synthetic eligibility seams. Hosted Auth/MFA is NOT represented by these settings.
 create function private.age_member_allowed() returns boolean language sql stable as $$select auth.uid() is not null and current_setting('test.age',true)='on'$$;
 create function private.age_eligible(uuid) returns boolean language sql stable as $$select current_setting('test.age',true)='on'$$;
 create function private.has_membership() returns boolean language sql stable as $$select current_setting('test.member',true)='on'$$;
 create function private.is_dealer_publisher(uuid) returns boolean language sql stable as $$select false$$;
 create function public.is_admin() returns boolean language sql stable as $$select false$$;
 create table private.account_erasure_jobs(user_id uuid,expires_at timestamptz);
 create table private.admin_users(user_id uuid);
 create table public.game_comments(id uuid,user_id uuid,body text);
 create table public.push_subscriptions(id uuid primary key default gen_random_uuid(),user_id uuid,endpoint text,p256dh text,auth text);
 create table public.app_updates(id uuid primary key,title text,body text,created_at timestamptz default now());
 create table public.app_update_reads(user_id uuid,update_id uuid,read_at timestamptz);
 create table public.games(id uuid primary key,sport text,kickoff_tbd boolean,kickoff timestamptz);
 insert into games values('${id(90)}','NFL',false,now()+interval '2 days');
 create table public.published_legs(leg_key text primary key,release_id uuid,official_pick_id uuid,leg_index integer,game_id uuid,kind text,name text,market text,result text,expires_at timestamptz,published_at timestamptz,quote text);
 insert into published_legs values('a',null,null,1,'${id(90)}','SINGLE','Sample Player','40+ rushing yards',null,now()+interval '2 days',now(),'-200'),('b',null,null,1,'${id(90)}','SINGLE','Other Player','20+ receiving yards',null,now()+interval '2 days',now(),null);
 create function private.nfl_gate_number(j jsonb)returns numeric language sql as $$select j::text::numeric$$;
 create function private.nfl_gate_time(t text)returns timestamptz language sql as $$select t::timestamptz$$;
 create table private.nfl_selection_gate_decisions(entity_id uuid,entity text,accepted boolean,evidence jsonb,created_at timestamptz default now());
 create table private.nfl_selection_model_approvals(model_id text,approved_at timestamptz,validation_url text);
 grant select on games,published_legs to authenticated;
 select set_config('test.age','on',false),set_config('test.member','on',false),set_config('test.gate','on',false),set_config('test.uid','${id(1)}',false);
 `);
  await migration("20261003112128_community_profiles.sql");
  await migration("20261003115658_community_profile_pages.sql");
  await migration("20261014025802_community_social_feed.sql");
  await migration("20261014041536_launch_safety_controls.sql");
  await migration("20261016151703_community_activity_bar.sql");
  await migration("20261011001739_member_saved_legs_and_follows.sql");
  for (const f of [
    "20261016161204_member_parlay_builder.sql",
    "20261016230144_member_parlays_seven_legs.sql",
    "20261017005051_member_parlays_no_leg_cap.sql",
  ])
    await migration(f);
  await db.exec(
    (
      await readFile(
        "supabase/migrations/20261017015506_social_notification_system.sql",
        "utf8",
      )
    ).replace(/^select cron.schedule.*$/gm, ""),
  );
  await migration("20261103181103_community_typed_reactions.sql");
  await migration("20261104101722_community_story_clock.sql");
  await db.exec(
    "alter table public.community_posts add column if not exists photo_path text",
  );
  await migration("20261108162552_community_polls.sql");
  await migration("20261108170014_community_post_votes.sql");
  await migration("20261029200000_community_avatars.sql");
  await migration("20261109020607_community_profile.sql");
  await migration("20261109022151_community_profile_fields.sql");
  await migration("20261110225115_member_profile_account_links.sql");
  await db.exec(`alter table community_posts add column if not exists card text;alter table community_posts add column if not exists photo_path text;
 insert into community_profiles(user_id,username,visible) values('${id(1)}','OwnerOne',true),('${id(2)}','OwnerTwo',true),('${id(3)}','HiddenUser',false);
 update community_profiles set avatar='data:image/jpeg;base64,eA==';
 insert into community_posts(id,user_id,sport,kind,title,body) values('${id(20)}','${id(1)}','nfl','talk','Synthetic post','Original synthetic discussion');
 create table vq_private_access_stage.entitlements(user_id uuid,active boolean);
 create function vq_private_access_stage.authorized() returns boolean language sql stable as $$select current_setting('test.gate',true)='on' and auth.uid() in ('${id(1)}','${id(2)}')::boolean and current_setting('test.aal',true)='aal2' and current_setting('test.session',true)='active'$$;
 create function vq_fixture.allowed() returns boolean language sql stable as $$select current_setting('test.member',true)='on'$$;
 create function public.age_verification_status() returns jsonb language sql stable as $$select jsonb_build_object('synthetic',true,'verified',current_setting('test.age',true)='on')$$;
 create function public.membership_status() returns jsonb language sql stable as $$select jsonb_build_object('allowed',current_setting('test.member',true)='on')$$;
 create table supabase_migrations.schema_migrations(version text,name text);
 insert into supabase_migrations.schema_migrations values('20261115172210','consumer_phase1_synthetic_contract_fixture'),('20261115173820','consumer_phase1_synthetic_age_shell');
 -- Minimal prerequisites above use synthetic-only tables; lock down every one before installing the adapter.
 do $$declare t record;begin for t in select tablename from pg_tables where schemaname='public' loop execute format('alter table public.%I enable row level security',t.tablename);end loop;end$$;
 create policy synthetic_catalog on published_legs for select to authenticated using(true);
 create policy synthetic_games on games for select to authenticated using(true);
 select set_config('test.aal','aal2',false),set_config('test.session','active',false);
 `);
  const sharing = await readFile(
    "supabase/migrations/20261017005801_community_sharing_and_photo_uploads.sql",
    "utf8",
  );
  // Reuse the original parlay-sharing section; storage objects are intentionally not created.
  await db.exec(
    sharing.slice(
      sharing.indexOf("-- Share the authoritative saved combination"),
    ),
  );
  await db.exec(
    `create function private.community_photo_access() returns boolean language sql stable as $$select private.age_member_allowed() and exists(select 1 from public.community_profiles where user_id=auth.uid() and visible and avatar is not null)$$;`,
  );
  const tails = await readFile(
    "supabase/migrations/20261018000000_compact_desk_and_batch_tails.sql",
    "utf8",
  );
  await db.exec(
    tails.slice(tails.indexOf("create function private.leg_tail_counts")),
  );
  const aclBefore = (
    await db.query(
      `select oid::regprocedure::text f,proacl::text acl from pg_proc where pronamespace in ('public'::regnamespace,'private'::regnamespace) order by 1`,
    )
  ).rows;
  await db.exec(await stageFeatureInstallSql());
  return {
    db,
    aclBefore,
    as: async (who = 1) => {
      await db.exec(
        `reset role;set role authenticated;select set_config('test.uid','${id(who)}',false);`,
      );
    },
    fixtureEnable: async () => {
      // Dispatcher/consumer tests explicitly enable groups on this LOCAL synthetic fixture only.
      // Production-shaped readiness is tested separately and never inferred from this override.
      await db.exec(
        `reset role;update vq_private_access_stage.feature_contract set capabilities='{"social":true,"profile":true,"desk":true,"notifications":true,"research":false}';`,
      );
    },
  };
}
