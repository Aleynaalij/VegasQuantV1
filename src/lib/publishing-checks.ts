import { implied, type Desk } from "./domain";
export type PublishCheck = {
  level: "pass" | "warning" | "block";
  message: string;
};
export function publishingChecks(
  action: string,
  p: Record<string, unknown>,
  d: Desk,
  now = Date.now(),
): PublishCheck[] {
  const checks: PublishCheck[] = [];
  const add = (ok: boolean, message: string) =>
    checks.push({ level: ok ? "pass" : "block", message });
  const warn = (message: string) => checks.push({ level: "warning", message });
  const text = (k: string) =>
    typeof p[k] === "string" && String(p[k]).trim().length > 0;
  const number = (k: string) =>
    p[k] !== null &&
    p[k] !== undefined &&
    p[k] !== "" &&
    Number.isFinite(Number(p[k]));
  const date = (k: string) =>
    text(k) && Number.isFinite(Date.parse(String(p[k])));
  const pick = d.picks.find((x) => x.id === p.pick_id),
    game = d.games.find((x) => x.id === (p.game_id || pick?.game_id)),
    kickoff = game ? Date.parse(game.kickoff) : NaN;
  if (
    [
      "pick",
      "market",
      "analysis",
      "entry",
      "close",
      "result",
      "review",
    ].includes(action)
  )
    add(!!game, "Game exists and is selected.");
  if (["market", "analysis", "entry", "close", "result"].includes(action))
    add(text("source"), "Source / owner handoff reference is supplied.");
  if (action === "pick") {
    add(
      kickoff > now,
      "Official recommendations must be published before kickoff.",
    );
    const analysis = d.analyses.find(
      (a) => a.id === p.analysis_id && a.game_id === p.game_id,
    );
    add(!!analysis, "Published analysis belongs to this game.");
    for (const k of [
      "selection",
      "book",
      "predicted_close",
      "best_number",
      "bet_grade",
      "timing",
      "playable_number",
      "pass_number",
      "why_like",
      "why_lose",
      "raw_handoff",
    ])
      add(text(k), `${k.replaceAll("_", " ")} is supplied.`);
    add(
      ["Side", "Moneyline", "Total", "Player Prop"].includes(String(p.market)),
      "Supported market is selected.",
    );
    add(
      number("edge") && Number(p.edge) >= 3 && Number(p.edge) <= 100,
      "Stated edge is at least 3 percentage points. Below 3: pass / pause.",
    );
    add(
      number("odds") &&
        Math.abs(Number(p.odds)) >= 100 &&
        Math.abs(Number(p.odds)) <= 100000,
      "American odds are valid.",
    );
    add(
      number("stake_cents") &&
        Number.isSafeInteger(Number(p.stake_cents)) &&
        Number(p.stake_cents) > 0,
      "Stake is a positive whole-cent amount.",
    );
    for (const k of [
      "model_probability",
      "market_probability",
      "confidence",
      "risk",
      "fear_index",
    ])
      add(
        number(k) &&
          Number(p[k]) >= 0 &&
          Number(p[k]) <= (k.endsWith("probability") ? 100 : 10),
        `${k.replaceAll("_", " ")} is in range.`,
      );
    add(
      p.market === "Moneyline"
        ? p.recommended_line === null
        : number("recommended_line"),
      "Line matches the market type.",
    );
    if (["Total", "Player Prop"].includes(String(p.market)))
      add(
        ["over", "under"].includes(String(p.direction)),
        "Over / under direction is supplied.",
      );
    if (p.stage_id) {
      const stage = d.stages.find((s) => s.id === p.stage_id),
        ch = d.challenges.find((c) => c.id === stage?.challenge_id);
      add(
        !!stage &&
          stage.game_id === p.game_id &&
          stage.stage_number === ch?.current_stage,
        "Pick matches the current challenge stage and game.",
      );
      add(
        !!ch &&
          !["PASS / PAUSED", "LOST", "COMPLETED", "OFFICIAL PLAY"].includes(
            ch.status,
          ),
        "Challenge is open for a new pick.",
      );
      add(
        !!ch && Number(p.stake_cents) <= ch.balance_cents,
        "Stake fits the challenge bankroll.",
      );
      add(
        !d.picks.some((x) => x.stage_id === p.stage_id),
        "Stage has no previously published pick.",
      );
    }
    if (
      d.picks.some(
        (x) =>
          x.game_id === p.game_id &&
          x.selection.trim().toLowerCase() ===
            String(p.selection).trim().toLowerCase(),
      )
    )
      add(
        false,
        "This selection already has a publication. Preserve it and publish an analysis update instead.",
      );
    if (analysis && Date.parse(analysis.created_at) < now - 6 * 3600000)
      warn(
        "Linked analysis is more than 6 hours old. Review injuries, weather, and the entry price.",
      );
    const latest = d.analyses
      .filter((a) => a.game_id === p.game_id)
      .sort((a, b) => b.version - a.version)[0];
    if (analysis && latest && analysis.id !== latest.id)
      warn(
        "A newer analysis version exists. Confirm the selected snapshot is intentional.",
      );
    const market = d.markets
      .filter((m) => m.game_id === p.game_id && m.kind === "current")
      .sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at))[0];
    if (!market)
      warn(
        "No current market snapshot is recorded. Confirm the supplied book and price from the handoff.",
      );
    else if (Date.parse(market.observed_at) < now - 6 * 3600000)
      warn(
        "Latest market snapshot is more than 6 hours old. It is not a live quote.",
      );
    if (
      number("model_probability") &&
      number("market_probability") &&
      number("edge") &&
      Math.abs(
        Number(p.model_probability) -
          Number(p.market_probability) -
          Number(p.edge),
      ) > 0.15
    )
      warn(
        "Stated edge differs from model probability minus market probability. Confirm with the analyst; values will not be changed.",
      );
    if (
      number("odds") &&
      Math.abs(Number(p.odds)) >= 100 &&
      number("market_probability") &&
      Math.abs(implied(Number(p.odds)) - Number(p.market_probability)) > 0.2
    )
      warn(
        "Stated market probability differs from raw implied probability. Confirm whether the analyst used a different method.",
      );
  }
  if (action === "analysis")
    add(
      text("title") && text("raw_handoff"),
      "Version title and original handoff are supplied.",
    );
  if (action === "market") {
    add(
      date("observed_at") && Date.parse(String(p.observed_at)) <= now + 300000,
      "Observation time is valid and not future-dated.",
    );
    add(
      ["spread", "moneyline", "total"].some(text),
      "At least one market price is supplied.",
    );
  }
  if (["entry", "close", "result", "review"].includes(action))
    add(!!pick, "Official pick is selected.");
  if (["entry", "close"].includes(action)) {
    add(
      number("odds") &&
        Math.abs(Number(p.odds)) >= 100 &&
        Math.abs(Number(p.odds)) <= 100000,
      "American odds are valid.",
    );
    add(
      pick?.market === "Moneyline" ? p.line === null : number("line"),
      "Actual / closing line matches the market type.",
    );
  }
  if (action === "entry") {
    add(
      !d.entries.some((x) => x.pick_id === p.pick_id),
      "Actual entry has not already been recorded.",
    );
    add(
      !d.results.some((x) => x.pick_id === p.pick_id),
      "Pick has not settled.",
    );
    add(
      date("bet_at") &&
        Date.parse(String(p.bet_at)) < kickoff &&
        Date.parse(String(p.bet_at)) <= now + 300000 &&
        Date.parse(String(p.bet_at)) >= Date.parse(pick?.created_at || ""),
      "Actual entry time is between publication and kickoff and not in the future.",
    );
  }
  if (action === "close") {
    add(
      now >= kickoff,
      "Kickoff has passed before recording the closing line.",
    );
    add(
      date("observed_at") &&
        Date.parse(String(p.observed_at)) <= kickoff &&
        Date.parse(String(p.observed_at)) >= kickoff - 3600000,
      "Closing observation is within the hour before kickoff.",
    );
    add(
      !d.closings.some((x) => x.pick_id === p.pick_id),
      "Closing line has not already been recorded.",
    );
  }
  if (action === "result") {
    add(
      now >= kickoff,
      "Game has started. Confirm it is final before grading.",
    );
    add(
      d.entries.some((x) => x.pick_id === p.pick_id),
      "Actual bet entry is recorded before settlement.",
    );
    add(
      !d.results.some((x) => x.pick_id === p.pick_id),
      "Pick has not already been settled.",
    );
    add(
      ["WIN", "LOSS", "PUSH", "VOID"].includes(String(p.result)),
      "Valid result is supplied.",
    );
    for (const k of ["away_score", "home_score"])
      add(
        number(k) && Number.isInteger(Number(p[k])) && Number(p[k]) >= 0,
        `${k.replaceAll("_", " ")} is a nonnegative whole number.`,
      );
    if (!d.closings.some((x) => x.pick_id === p.pick_id))
      warn(
        "Closing line is missing. Price CLV will remain unavailable until recorded.",
      );
    warn(
      "Confirm the final outcome with the cited source. A final score alone does not grade a player prop.",
    );
  }
  if (action === "review")
    add(
      d.results.some((x) => x.pick_id === p.pick_id),
      "Pick is settled before process grading.",
    );
  return checks;
}
