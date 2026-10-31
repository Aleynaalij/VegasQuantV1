import { createClient } from "@supabase/supabase-js";
import type { SportGame } from "../../../src/lib/sport-contract.ts";
import type {
  NhlReport,
  NhlSource,
  NhlTeamReport,
} from "../../../src/lib/nhl-context.ts";
import {
  goalieForm,
  goalieCandidates,
  finalGoalieLog,
  recentGames,
  resolveGoalie,
  rosterPlayers,
  rotowireLineup,
  skaterForm,
  targetGame,
  teamForm,
} from "./normalize.ts";
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
async function rpc(name: string, args: Record<string, unknown> = {}) {
  const r = await db.rpc(name, args);
  if (r.error) throw Error(r.error.message);
  return r.data;
}
const hash = async (s: string) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
const official = (s: string) =>
  (
    ({ LA: "LAK", NJ: "NJD", SJ: "SJS", TB: "TBL", UTAH: "UTA" }) as Record<
      string,
      string
    >
  )[s] || s;
const valid = new Set(
  "ANA BOS BUF CAR CBJ CGY CHI COL DAL DET EDM FLA LAK MIN MTL NJD NSH NYI NYR OTT PHI PIT SEA SJS STL TBL TOR UTA VAN VGK WPG WSH".split(
    " ",
  ),
);
async function batches<T, R>(rows: T[], f: (r: T) => Promise<R>, limit = 4) {
  const out: R[] = [];
  for (let i = 0; i < rows.length; i += limit)
    out.push(...(await Promise.all(rows.slice(i, i + limit).map(f))));
  return out;
}
Deno.serve(async (req: Request) => {
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (
    !token ||
    (await rpc("feed_authorize", { p_digest: await hash(token) })) !== true
  )
    return new Response("Unauthorized", { status: 401 });
  const work = await rpc("nhl_context_work"),
    results: unknown[] = [];
  const pending = new Map<
    string,
    Promise<{ body: string; source: NhlSource }>
  >();
  async function read(url: string, ttl: number) {
    if (!pending.has(url))
      pending.set(
        url,
        (async () => {
          let raw = await rpc("nhl_context_source", { p_url: url });
          if (!raw) {
            const r = await fetch(url, {
              headers: {
                "User-Agent":
                  "VegasQuant/1.0 (sports research; vegasquant.app)",
                Accept: url.includes("rotowire")
                  ? "text/html"
                  : "application/json",
              },
              signal: AbortSignal.timeout(12000),
            });
            if (!r.ok)
              throw Error(`${new URL(url).hostname}: HTTP ${r.status}`);
            if (Number(r.headers.get("content-length")) > 2500000)
              throw Error("Source too large");
            const body = await r.text();
            if (new TextEncoder().encode(body).length > 2500000)
              throw Error("Source too large");
            raw = await rpc("nhl_context_source", {
              p_url: url,
              p_body: body,
              p_ttl: ttl,
            });
          }
          return {
            body: raw.body,
            source: {
              url: raw.url,
              sha256: raw.sha256,
              retrieved_at: raw.retrieved_at,
            },
          };
        })(),
      );
    return pending.get(url)!;
  }
  for (const game of (work.games || []) as SportGame[]) {
    const sources = new Map<string, NhlSource>();
    const get = async (url: string, ttl = 900) => {
      const r = await read(url, ttl);
      sources.set(url, r.source);
      return r;
    };
    const json = async (url: string, ttl = 900) =>
      JSON.parse((await get(url, ttl)).body);
    try {
      const away = official(game.away.abbreviation),
        home = official(game.home.abbreviation);
      if (!valid.has(away) || !valid.has(home))
        throw Error("Unknown NHL team code");
      const d = new Date(game.start_time),
        year = d.getUTCFullYear() - (d.getUTCMonth() < 6 ? 1 : 0),
        season = year * 10000 + year + 1;
      const schedules = await Promise.all(
        [away, home].map((a) =>
          json(
            `https://api-web.nhle.com/v1/club-schedule-season/${a}/${season}`,
            600,
          ),
        ),
      );
      const target = targetGame(
        schedules[0],
        away,
        home,
        game.start_time,
        season,
      );
      if (
        targetGame(schedules[1], away, home, game.start_time, season).id !==
        target.id
      )
        throw Error("NHL schedules disagree on matchup");
      const notes: string[] = [];
      let lineup: ReturnType<typeof rotowireLineup> = null;
      try {
        const r = await get(
          `https://www.rotowire.com/hockey/nhl-lineups.php?date=${target.gameDate}`,
          600,
        );
        lineup = rotowireLineup(r.body, target.gameDate, away, home, r.source);
        if (!lineup)
          notes.push(
            "Rotowire lineup could not bind to this date and matchup.",
          );
      } catch (e) {
        notes.push("Rotowire lineup unavailable: " + String(e).slice(0, 100));
      }
      const reports: NhlTeamReport[] = [];
      for (const [i, code] of [away, home].entries()) {
        const team = i === 0 ? game.away : game.home,
          roster = await json(
            `https://api-web.nhle.com/v1/roster/${code}/${season}`,
            3600,
          )
            .then(rosterPlayers)
            .catch(() => []);
        const games = recentGames(schedules[i], code, game.start_time, season),
          teamNotes = [...notes];
        const boxes = new Map<number, unknown>();
        await batches(games, async (g) => {
          try {
            boxes.set(
              g.id,
              await json(
                `https://api-web.nhle.com/v1/gamecenter/${g.id}/boxscore`,
                21600,
              ),
            );
          } catch {
            teamNotes.push(`NHL box score ${g.id} is not available.`);
          }
        });
        const form = teamForm(games, code),
          skaters = skaterForm(games, boxes, code, roster, season),
          rw = lineup?.[i];
        let goalie: NhlTeamReport["goalie"] = null;
        if (rw?.goalie) {
          const person = resolveGoalie(roster, rw.goalie.name);
          let stats = {
            sample: 0,
            gaa: null,
            seconds: null,
            goalsAgainst: null,
          } as ReturnType<typeof goalieForm>;
          if (person)
            try {
              const log = await json(
                `https://api-web.nhle.com/v1/player/${person.id}/game-log/${season}/2`,
                900,
              );
              if (log.seasonId !== season || log.gameTypeId !== 2)
                throw Error("Goalie season/type mismatch");
              const goalieBoxes = new Map<number, any>();
              await batches(
                goalieCandidates(log, target.gameDate),
                async (row: any) => {
                  try {
                    goalieBoxes.set(
                      row.gameId,
                      await json(
                        `https://api-web.nhle.com/v1/gamecenter/${row.gameId}/boxscore`,
                        21600,
                      ),
                    );
                  } catch {
                    /* Missing required entries fail verification below. */
                  }
                },
              );
              stats = goalieForm(
                finalGoalieLog(
                  log,
                  target.gameDate,
                  season,
                  person.id,
                  goalieBoxes,
                ),
                target.gameDate,
              );
            } catch {
              teamNotes.push(
                "Selected goalie's NHL appearance log is unavailable.",
              );
            }
          else
            teamNotes.push(
              "Rotowire goalie could not be matched to one official roster identity.",
            );
          goalie = { ...rw.goalie, id: person?.id ?? null, ...stats };
        }
        if (!roster.length)
          teamNotes.push(
            "Official roster unavailable; no inferred player identity.",
          );
        reports.push({
          abbreviation: team.abbreviation,
          name: team.name,
          ...form,
          ...skaters,
          roster: roster
            .filter((p) => !p.goalie)
            .map(({ id, name }) => ({ id, name })),
          goalie,
          powerPlay: rw?.powerPlay || null,
          notes: teamNotes,
        });
      }
      const report: NhlReport = {
        version: 1,
        game_id: game.id,
        cutoff: game.start_time,
        generated_at: work.now,
        nhl_game_id: target.id,
        nhl_url: `https://www.nhl.com${target.gameCenterLink}`,
        teams: reports as NhlReport["teams"],
        sources: [...sources.values()],
      };
      await rpc("nhl_context_finish", { p_game: game.id, p_report: report });
      results.push({
        game: game.id,
        status: "saved",
        teams: reports.map((t) => ({
          team: t.abbreviation,
          games: t.games.length,
          boxes: t.boxesVerified,
          goalie: !!t.goalie,
          pp1: !!t.powerPlay,
        })),
      });
    } catch (e) {
      const error = String(e).slice(0, 250);
      await rpc("nhl_context_finish", { p_game: game.id, p_error: error });
      results.push({ game: game.id, status: "failed", error });
    }
  }
  return Response.json({ results });
});
