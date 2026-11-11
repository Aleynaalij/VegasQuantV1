import { ResearchFrame } from "@/lib/vq-research-frame";
import {
  chartPlayers,
  nhlStamp,
  restDays,
  type NhlChartSnapshot,
} from "@/lib/nhl-chart-package";
const gold = "#e8ca7d",
  green = "#48d58a",
  white = "#f2f4f5",
  muted = "#aab8b0";
const panel = {
  display: "flex" as const,
  flexDirection: "column" as const,
  border: "1px solid #ffffff22",
  borderRadius: 16,
  padding: 18,
  background: "#ffffff06",
};
function Bars({
  values,
  labels,
  max = 8,
  color = green,
}: {
  values: (number | null)[];
  labels: string[];
  max?: number;
  color?: string;
}) {
  return (
    <div
      style={{ display: "flex", height: 146, alignItems: "flex-end", gap: 7 }}
    >
      {values.map((v, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: 53,
          }}
        >
          <div style={{ display: "flex", fontSize: 23, color: white }}>
            {v === null ? "—" : v}
          </div>
          <div
            style={{
              display: "flex",
              height: v === null ? 2 : Math.max(2, (v / max) * 85),
              width: 38,
              background: v === null ? "#57635d" : color,
              borderRadius: 4,
            }}
          />
          <div
            style={{
              display: "flex",
              fontSize: 17,
              color: muted,
              marginTop: 7,
            }}
          >
            {labels[i]}
          </div>
        </div>
      ))}
    </div>
  );
}
function Small({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{ display: "flex", fontSize: 20, color: muted, lineHeight: 1.3 }}
    >
      {children}
    </div>
  );
}
function Matchup({ s }: { s: NhlChartSnapshot }) {
  return (
    <div style={{ display: "flex", gap: 18, marginTop: 22 }}>
      {s.teams.map((t) => {
        const games = [...t.games].reverse(),
          rest = restDays(s.day, t.games[0]?.date);
        return (
          <div key={t.abbreviation} style={{ ...panel, width: 462 }}>
            <div
              style={{
                display: "flex",
                fontFamily: "Barlow Condensed",
                fontSize: 40,
                color: gold,
              }}
            >
              {t.name}
            </div>
            <Small>{games.length} prior games · GF / GA per game</Small>
            <div
              style={{
                display: "flex",
                fontSize: 39,
                color: white,
                marginTop: 10,
              }}
            >
              {t.goalsForPerGame?.toFixed(2) ?? "—"} /{" "}
              {t.goalsAgainstPerGame?.toFixed(2) ?? "—"}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 24,
                color: green,
                marginTop: 14,
              }}
            >
              Goals for
            </div>
            <Bars
              values={games.map((g) => g.goalsFor)}
              labels={games.map((g) => g.date.slice(5))}
              max={Math.max(8, ...games.map((g) => g.goalsFor))}
            />
            <div
              style={{
                display: "flex",
                fontSize: 24,
                color: gold,
                marginTop: 18,
              }}
            >
              Goals against
            </div>
            <Bars
              values={games.map((g) => g.goalsAgainst)}
              labels={games.map((g) => g.date.slice(5))}
              max={Math.max(8, ...games.map((g) => g.goalsAgainst))}
              color={gold}
            />
            <div
              style={{
                display: "flex",
                fontSize: 24,
                color: white,
                marginTop: 24,
              }}
            >
              Rest:{" "}
              {rest === null
                ? "unavailable"
                : rest === 0
                  ? "back-to-back"
                  : `${rest} calendar off day${rest === 1 ? "" : "s"}`}
            </div>
            <Small>Travel route / distance: unavailable</Small>
            <div
              style={{
                display: "flex",
                fontSize: 24,
                color: gold,
                marginTop: 24,
              }}
            >
              Goalie · {t.goalie?.status ?? "unknown"}
            </div>
            <div style={{ display: "flex", fontSize: 27, color: white }}>
              {t.goalie?.name ?? "Not confirmed"}
            </div>
            <Small>
              {t.goalie
                ? `${t.goalie.gaa?.toFixed(2) ?? "—"} GAA · ${t.goalie.sample} verified prior appearances`
                : "No goalie assignment source"}
            </Small>
            <Small>
              {t.goalie
                ? `Source checked ${nhlStamp(t.goalie.source.retrieved_at)}`
                : "Morning information may change"}
            </Small>
          </div>
        );
      })}
    </div>
  );
}
function Volume({ s }: { s: NhlChartSnapshot }) {
  const top = s.teams.flatMap((t) => chartPlayers(t).slice(0, 2));
  const toiMax = Math.max(
    35,
    ...top.flatMap((p) => p.samples.map((x) => Math.ceil(x.seconds / 300) * 5)),
  );
  const shotsMax = Math.max(
    8,
    ...top.flatMap((p) => p.samples.map((x) => x.shots ?? 0)),
  );
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        marginTop: 20,
      }}
    >
      {s.teams.flatMap((t) =>
        chartPlayers(t)
          .slice(0, 2)
          .map((p) => {
            const dates = [...t.games].reverse().map((g) => g.date);
            const samples = dates.map((d) =>
              p.samples.find((x) => x.date === d),
            );
            const mins = samples.map((x) => (x ? x.seconds / 60 : null));
            const points = mins.map((v, i) =>
              v === null ? null : `${i * 62},${70 - (v / toiMax) * 60}`,
            );
            return (
              <div
                key={t.abbreviation + p.id}
                style={{
                  ...panel,
                  padding: 14,
                  flexDirection: "row",
                  height: 186,
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    width: 280,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      fontFamily: "Barlow Condensed",
                      fontSize: 34,
                      color: white,
                    }}
                  >
                    {p.name}
                  </div>
                  <Small>
                    {t.abbreviation} · {p.samples.length}/{t.games.length}{" "}
                    appearances
                  </Small>
                  <Small>
                    G {p.goals ?? "—"} · P {p.points ?? "—"} ·{" "}
                    {p.minutes.toFixed(1)} min/game
                  </Small>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    width: 330,
                  }}
                >
                  <Small>SOG · actual team-game window</Small>
                  <Bars
                    values={samples.map((x) => x?.shots ?? null)}
                    labels={dates.map((d) => d.slice(5))}
                    max={shotsMax}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    width: 260,
                  }}
                >
                  <Small>TOI min · 0–{toiMax} scale</Small>
                  <svg width={250} height={85} viewBox="0 0 250 85">
                    <line x1="0" y1="70" x2="250" y2="70" stroke="#68776d" />
                    {points
                      .slice(1)
                      .map((p, i) =>
                        p && points[i] ? (
                          <polyline
                            key={i}
                            points={`${points[i]} ${p}`}
                            fill="none"
                            stroke={gold}
                            strokeWidth={3}
                          />
                        ) : null,
                      )}
                    {mins.map((v, i) =>
                      v === null ? null : (
                        <circle
                          key={i}
                          cx={i * 62}
                          cy={70 - (v / toiMax) * 60}
                          r={4}
                          fill={gold}
                        />
                      ),
                    )}
                  </svg>
                  <Small>
                    {mins
                      .map((v) => (v === null ? "—" : v.toFixed(1)))
                      .join(" · ")}
                  </Small>
                </div>
              </div>
            );
          }),
      )}
      <Small>
        — = no verified row, not zero. Historical volume does not confirm
        tonight’s lineup. Sources and all players in the full report.
      </Small>
    </div>
  );
}
function Blocks({ s }: { s: NhlChartSnapshot }) {
  const max = Math.max(
    10,
    ...s.teams
      .flatMap((t) => chartPlayers(t, true).slice(0, 3))
      .map((p) => p.blocksPer60 ?? 0),
  );
  return (
    <div style={{ display: "flex", gap: 18, marginTop: 22 }}>
      {s.teams.map((t) => {
        const ps = chartPlayers(t, true).slice(0, 3);
        return (
          <div key={t.abbreviation} style={{ ...panel, width: 462 }}>
            <div
              style={{
                display: "flex",
                fontFamily: "Barlow Condensed",
                fontSize: 40,
                color: gold,
              }}
            >
              {t.abbreviation} · BLOCKS / 60
            </div>
            <Small>Σ blocks ÷ Σ verified TOI × 60</Small>
            {ps.length ? (
              ps.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    marginTop: 22,
                  }}
                >
                  <div style={{ display: "flex", fontSize: 25, color: white }}>
                    {p.name} · {p.blocksPer60?.toFixed(2) ?? "—"}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      width:
                        p.blocksPer60 === null
                          ? 2
                          : Math.max(2, (p.blocksPer60 / max) * 390),
                      height: 19,
                      background: green,
                      marginTop: 7,
                    }}
                  />
                  <Small>
                    {p.samples.length} appearances · {p.minutes.toFixed(1)}{" "}
                    min/game
                  </Small>
                </div>
              ))
            ) : (
              <Small>Verified defenseman sample unavailable</Small>
            )}
            <div
              style={{
                display: "flex",
                fontFamily: "Barlow Condensed",
                fontSize: 34,
                color: gold,
                marginTop: 34,
              }}
            >
              PP1 · PROJECTED
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 24,
                color: white,
                lineHeight: 1.5,
              }}
            >
              {t.powerPlay?.players.map((p) => p.name).join(" · ") ??
                "Unavailable"}
            </div>
            <Small>
              {t.powerPlay
                ? `Source checked ${nhlStamp(t.powerPlay.source.retrieved_at)}`
                : "No projected unit source"}
            </Small>
            <div
              style={{
                display: "flex",
                marginTop: 24,
                fontSize: 22,
                color: muted,
              }}
            >
              Rate is recent all-opponent exposure, not a matchup floor.
              Linemates, late scratches and opponent-adjusted splits remain
              unavailable.
            </div>
          </div>
        );
      })}
    </div>
  );
}
export function NhlChartImage({
  s,
  page,
}: {
  s: NhlChartSnapshot;
  page: number;
}) {
  const names = s.teams.map((t) => t.abbreviation).join(" @ ");
  return (
    <ResearchFrame
      badge="NHL RESEARCH"
      accent={names}
      title={page === 1 ? "MATCHUP" : page === 2 ? "VOLUME" : "BLOCKS"}
      subtitle={
        page === 1
          ? "RECENT SCORING · GOALIES · REST"
          : page === 2
            ? "SHOTS ON GOAL · GOALS · POINTS · ICE TIME"
            : "VERIFIED ICE-TIME DENOMINATORS · PROJECTED PP1"
      }
      meta={`${nhlStamp(s.game.start_time)} · PAGE ${page} OF 3 · DATA ${nhlStamp(s.collected_at)}`}
      footer="Research only · past performance is not a prediction. NHL.com / RotoWire. Full sources and coverage gaps in The Zone."
    >
      {page === 1 ? (
        <Matchup s={s} />
      ) : page === 2 ? (
        <Volume s={s} />
      ) : (
        <Blocks s={s} />
      )}
    </ResearchFrame>
  );
}
