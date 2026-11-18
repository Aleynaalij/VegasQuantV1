// Local synthetic original-contract database, never an external Supabase connection.
import { createServer } from "node:http";
import { consumerDb, id } from "../../tests/fixtures/stage-consumer-db.mjs";
const fixture = await consumerDb();
const { db } = fixture;
await fixture.fixtureEnable();
// Complete the synthetic original catalog projection for browser rendering.
await db.exec(`reset role;
alter table published_legs add column matchup text,add column quote_observed_at timestamptz,add column gambly_url text,add column copy_text text,add column why text,add column risk text,add column result_source text,add column odds numeric,add column original_leg_key text;
update published_legs set matchup='Synthetic Away @ Synthetic Home',why='Synthetic fixture only',risk='Synthetic fixture only';
update community_profiles set avatar='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==';
update vq_private_access_stage.feature_contract set fingerprints=vq_private_access_stage.feature_fingerprints();`);
await fixture.as(2);
await db.exec(
  `insert into member_follows(user_id,target_user_id) values('${id(2)}','${id(1)}')`,
);
await fixture.as(1);
await db.exec(
  `insert into saved_legs(user_id,leg_key) values('${id(1)}','a');select create_member_parlay('Synthetic saved lay',array['a','b']);`,
);
let chain = Promise.resolve();
let logoutFailure = false;
const server = createServer((req, res) => {
  chain = chain
    .then(async () => {
      try {
        if (req.headers.authorization !== "Bearer fixture.owner.token") {
          res.writeHead(403);
          res.end("{}");
          return;
        }
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 400000) throw Error("bound");
        }
        const path = new URL(req.url, "http://127.0.0.1").pathname;
        if (path === "/fixture/incomplete-profile") {
          await db.exec(
            `reset role;update public.community_profiles set avatar=null where user_id='${id(1)}'`,
          );
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end("{}");
          return;
        }
        if (path === "/fixture/logout-mode") {
          if (req.method === "POST")
            logoutFailure = JSON.parse(body).fail === true;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ fail: logoutFailure }));
          return;
        }
        await fixture.as(1);
        const query =
          path === "/rest/v1/rpc/vq_private_access_stage_features"
            ? "select public.vq_private_access_stage_features() r"
            : path === "/rest/v1/rpc/vq_private_access_stage_feature"
              ? "select public.vq_private_access_stage_feature($1::jsonb) r"
              : null;
        if (!query) throw Error("Unknown fixture service");
        const result = await db.query(
          query,
          query.includes("$1") ? [JSON.stringify(JSON.parse(body).p)] : [],
        );
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result.rows[0].r));
      } catch (error) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(error) }));
      }
    })
    .catch((error) => {
      console.error(error);
      res.destroy();
    });
});
server.listen(Number(process.env.ATLAS_FEATURE_PORT || 3221), "127.0.0.1", () =>
  console.log("SYNTHETIC_FEATURE_BACKEND_READY"),
);
process.on("SIGTERM", () => {
  server.close();
  void db.close();
});
