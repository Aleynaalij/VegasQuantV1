"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { onUserChange } from "@/lib/auth-user";
import { time } from "@/lib/domain";

type Dataset = {
  id: string;
  stat_type: string;
  source_url: string;
  source_sha256: string;
  source_updated_at: string;
  retrieved_at: string;
  through_week: number | null;
  attribution: string;
  rows: Record<string, string | null>[];
};
const metrics: Record<string, [string, string, string][]> = {
  passing: [
    ["avg_time_to_throw", "Time to throw", "s"],
    [
      "completion_percentage_above_expectation",
      "Completion above expectation",
      "pp",
    ],
    ["avg_intended_air_yards", "Intended air yards", "yd"],
  ],
  rushing: [
    [
      "rush_yards_over_expected_per_att",
      "Yards above expectation / carry",
      "yd",
    ],
    ["percent_attempts_gte_eight_defenders", "8+ defenders in box", "%"],
    ["rush_attempts", "Carries", ""],
  ],
  receiving: [
    ["avg_separation", "Separation at target", "yd"],
    ["avg_yac_above_expectation", "YAC above expectation", "yd"],
    ["targets", "Targets", ""],
  ],
};
function metric(value: string | null | undefined, unit: string) {
  if (value == null || value === "" || !Number.isFinite(Number(value)))
    return "Not reported";
  return `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ""}`;
}
export default function NgsContext({
  gameId,
  before,
}: {
  gameId: string;
  before?: string;
}) {
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState<Dataset[] | null>(null),
    [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setRows(null);
    setFailed(false);
    const changed = onUserChange(() => {
      if (live) {
        setRows(null);
        setRetry((v) => v + 1);
      }
    });
    if (open)
      void supabase
        .rpc("nfl_ngs_game_context", {
          p_game_id: gameId,
          p_before: before || null,
        })
        .abortSignal(AbortSignal.timeout(15000))
        .then(
          (result) => {
            if (!live) return;
            setFailed(!!result.error);
            if (!result.error) setRows(result.data?.datasets || []);
          },
          () => {
            if (live) setFailed(true);
          },
        );
    return () => {
      live = false;
      changed();
    };
  }, [gameId, before, open, retry]);
  return (
    <details
      className="mi-section"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Next Gen Stats · historical player context</summary>
      <p>
        Weekly NFL Next Gen Stats via nflverse. Each player shows their latest
        reported week from the three weeks before this matchup. These summaries
        are not a live tracking feed or a forecast.
      </p>
      <p className="muted">
        Minimum-attempt thresholds limit coverage. A missing player or metric
        does not mean zero. Historical team labels do not establish a player’s
        current roster, role or availability.
      </p>
      {open && failed ? (
        <p role="status">
          NGS context could not load.{" "}
          <button className="text-link" onClick={() => setRetry((v) => v + 1)}>
            Retry
          </button>
        </p>
      ) : open && rows === null ? (
        <p role="status">Loading NGS context…</p>
      ) : null}
      {rows?.length === 0 && (
        <p>
          No eligible NGS snapshots were available for this game and research
          date.
        </p>
      )}
      {!!rows?.length &&
        Object.keys(metrics).some(
          (kind) => !rows.some((source) => source.stat_type === kind),
        ) && (
          <p role="status">
            Some NGS categories are unavailable for this research date:{" "}
            {Object.keys(metrics)
              .filter(
                (kind) => !rows.some((source) => source.stat_type === kind),
              )
              .join(", ")}
            .
          </p>
        )}
      {rows?.map((source) => (
        <section key={source.id} className="mi-item">
          <h3>
            {source.stat_type[0].toUpperCase() + source.stat_type.slice(1)}
          </h3>
          <p className="muted">
            Dataset through{" "}
            {source.through_week
              ? `Week ${source.through_week}`
              : "no eligible prior week"}{" "}
            · Source updated {time(source.source_updated_at)} · Retrieved{" "}
            {time(source.retrieved_at)}
          </p>
          {!source.rows.length && (
            <p>No qualifying recent player rows for these teams.</p>
          )}
          {source.rows.map((player) => (
            <article
              className="mi-item"
              key={`${player.player_gsis_id}-${player.team_abbr}`}
            >
              <h4>
                {player.player_display_name} · {player.team_abbr} · Week{" "}
                {player.week}
              </h4>
              <dl className="mi-fields">
                {(metrics[source.stat_type] || []).map(
                  ([field, label, unit]) => (
                    <div key={field}>
                      <dt>{label}</dt>
                      <dd>{metric(player[field], unit)}</dd>
                    </div>
                  ),
                )}
              </dl>
            </article>
          ))}
          <details>
            <summary>Source and attribution</summary>
            <p>
              {source.attribution}.{" "}
              <a
                href="https://creativecommons.org/licenses/by/4.0/"
                target="_blank"
                rel="noopener noreferrer"
              >
                License ↗
              </a>
            </p>
            <p>
              <a
                href={source.source_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Original nflverse source ↗
              </a>
            </p>
            <p className="muted" style={{ overflowWrap: "anywhere" }}>
              SHA-256: {source.source_sha256}
            </p>
          </details>
        </section>
      ))}
      <p>
        <a
          href="https://nflreadr.nflverse.com/articles/dictionary_nextgen_stats.html"
          target="_blank"
          rel="noopener noreferrer"
        >
          Metric definitions ↗
        </a>
      </p>
    </details>
  );
}
