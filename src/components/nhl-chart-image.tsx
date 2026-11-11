import { ResearchFrame } from "@/lib/vq-research-frame";
import {
  chartPlayers,
  blockChartPlayers,
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
  padding: 20,
  background: "#ffffff06",
};
function Text({
  children,
  size = 40,
  color = muted,
}: {
  children: React.ReactNode;
  size?: number;
  color?: string;
}) {
  return (
    <div style={{ display: "flex", fontSize: size, color, lineHeight: 1.2 }}>
      {children}
    </div>
  );
}
function Bars({
  values,
  labels,
  max,
  color = green,
  height = 100,
  width = 76,
}: {
  values: (number | null)[];
  labels: string[];
  max: number;
  color?: string;
  height?: number;
  width?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 8,
        height: height + 105,
      }}
    >
      {values.map((v, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width,
          }}
        >
          <Text size={50} color={white}>
            {v === null ? "—" : v}
          </Text>
          <div
            style={{
              display: "flex",
              height: v === null ? 2 : Math.max(2, (v / max) * height),
              width: width - 20,
              borderRadius: 5,
              background: v === null ? "#57635d" : color,
            }}
          />
          <Text size={28}>{labels[i]}</Text>
        </div>
      ))}
    </div>
  );
}
function Matchup({ s }: { s: NhlChartSnapshot }) {
  const max = Math.max(
    8,
    ...s.teams.flatMap((t) =>
      t.games.flatMap((g) => [g.goalsFor, g.goalsAgainst]),
    ),
  );
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        marginTop: 16,
      }}
    >
      <div style={{ display: "flex", gap: 35 }}>
        <Text size={36} color={green}>
          GREEN · GOALS FOR
        </Text>
        <Text size={36} color={gold}>
          GOLD · GOALS AGAINST
        </Text>
      </div>
      {s.teams.map((t) => {
        const games = [...t.games].reverse(),
          rest = restDays(s.day, t.games[0]?.date);
        return (
          <div key={t.abbreviation} style={{ ...panel, padding: 14 }}>
            <Text size={50} color={gold}>
              {t.name}
            </Text>
            <Text size={36} color={white}>
              {games.length} prior games · GF{" "}
              {t.goalsForPerGame?.toFixed(2) ?? "—"} / GA{" "}
              {t.goalsAgainstPerGame?.toFixed(2) ?? "—"} per game
            </Text>
            <div
              style={{
                display: "flex",
                height: 190,
                alignItems: "flex-end",
                gap: 12,
              }}
            >
              {games.map((g) => (
                <div
                  key={g.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    width: 160,
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "flex-end", gap: 10 }}
                  >
                    {[g.goalsFor, g.goalsAgainst].map((v, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                        }}
                      >
                        <Text size={50} color={i ? gold : green}>
                          {v}
                        </Text>
                        <div
                          style={{
                            display: "flex",
                            width: 55,
                            height: Math.max(2, (v / max) * 75),
                            background: i ? gold : green,
                            borderRadius: 4,
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <Text size={28}>{g.date.slice(5)}</Text>
                </div>
              ))}
            </div>
            <Text size={32}>
              Rest:{" "}
              {rest === null
                ? "unavailable"
                : rest === 0
                  ? "back-to-back"
                  : `${rest} calendar off days`}{" "}
              · Travel: unavailable
            </Text>
          </div>
        );
      })}
      <Text size={32}>
        Goalies & PP1: pages 8–9. Calendar off days are not verified recovery
        hours or team travel.
      </Text>
    </div>
  );
}
function Volume({ s, index }: { s: NhlChartSnapshot; index: number }) {
  const t = s.teams[Math.floor(index / 2)],
    p = chartPlayers(t)[index % 2],
    dates = [...t.games].reverse().map((g) => g.date);
  if (!p)
    return (
      <div style={{ ...panel, marginTop: 25 }}>
        <Text size={54} color={gold}>
          {t.name}
        </Text>
        <Text size={48}>Verified player volume sample unavailable.</Text>
      </div>
    );
  const samples = dates.map((d) => p.samples.find((x) => x.date === d)),
    mins = samples.map((x) => (x ? x.seconds / 60 : null)),
    all = s.teams
      .flatMap((t) => chartPlayers(t).slice(0, 2))
      .flatMap((p) => p.samples),
    shotsMax = Math.max(8, ...all.map((x) => x.shots ?? 0)),
    max = Math.max(35, ...all.map((x) => Math.ceil(x.seconds / 300) * 5)),
    y = (v: number) => 90 - (v / max) * 75;
  return (
    <div style={{ ...panel, marginTop: 20, gap: 8 }}>
      <Text size={64} color={white}>
        {p.name}
      </Text>
      <Text size={36} color={gold}>
        {t.name} · {p.samples.length}/{t.games.length} appearances
      </Text>
      <Text size={44} color={white}>
        Goals {p.goals ?? "—"} · Points {p.points ?? "—"} · Avg TOI{" "}
        {p.minutes.toFixed(1)} min
      </Text>
      <Text size={36} color={green}>
        SHOTS ON GOAL · 0–{shotsMax} scale
      </Text>
      <Bars
        values={samples.map((x) => x?.shots ?? null)}
        labels={dates.map((d) => d.slice(5))}
        max={shotsMax}
        height={80}
        width={163}
      />
      <Text size={36} color={gold}>
        ICE TIME · minutes · 0–{max} scale
      </Text>
      <svg width={850} height={105} viewBox="0 0 850 105">
        <line x1="18" y1="90" x2="832" y2="90" stroke="#68776d" />
        {mins
          .slice(1)
          .map((v, i) =>
            v !== null && mins[i] !== null ? (
              <line
                key={i}
                x1={81 + i * 171}
                y1={y(mins[i]!)}
                x2={281 + i * 171}
                y2={y(v)}
                stroke={gold}
                strokeWidth={5}
              />
            ) : null,
          )}
        {mins.map((v, i) =>
          v === null ? null : (
            <circle key={i} cx={81 + i * 171} cy={y(v)} r={7} fill={gold} />
          ),
        )}
      </svg>
      <div style={{ display: "flex", gap: 8 }}>
        {mins.map((v, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              width: 163,
            }}
          >
            <Text size={44} color={white}>
              {v === null ? "—" : v.toFixed(1)}
            </Text>
            <Text size={28}>{dates[i]?.slice(5)}</Text>
          </div>
        ))}
      </div>
      <Text size={30}>
        — = no verified field or appearance, not zero. Historical workload does
        not confirm tonight’s lineup.
      </Text>
    </div>
  );
}
function Blocks({ s, index }: { s: NhlChartSnapshot; index: number }) {
  const t = s.teams[index],
    players = blockChartPlayers(t).slice(0, 3),
    max = Math.max(
      10,
      ...s.teams
        .flatMap((x) => blockChartPlayers(x).slice(0, 3))
        .map((x) => x.blocksPer60 ?? 0),
    );
  return (
    <div style={{ ...panel, marginTop: 20, gap: 24 }}>
      <Text size={60} color={gold}>
        {t.name}
      </Text>
      <Text size={42}>BLOCKS / 60 · 3+ appearances / 30+ TOI minutes</Text>
      {players.length ? (
        players.map((p) => (
          <div
            key={p.id}
            style={{
              display: "flex",
              flexDirection: "column",
              marginBottom: 15,
              gap: 8,
            }}
          >
            <Text size={54} color={white}>
              {p.name} · {p.blocksPer60!.toFixed(2)}
            </Text>
            <div
              style={{
                display: "flex",
                width: Math.max(2, (p.blocksPer60! / max) * 850),
                height: 30,
                background: green,
              }}
            />
            <Text size={38}>
              {p.samples.length} appearances · {p.minutes.toFixed(1)} TOI
              min/game
            </Text>
          </div>
        ))
      ) : (
        <Text size={48}>Verified defenseman exposure unavailable.</Text>
      )}
      <Text size={38}>Σ blocks ÷ Σ verified TOI × 60</Text>
      <Text size={36}>
        Recent all-opponent exposure. Opponent-adjusted splits are unavailable;
        this rate is not a matchup floor.
      </Text>
    </div>
  );
}
function Roles({ s, index }: { s: NhlChartSnapshot; index: number }) {
  const t = s.teams[index];
  return (
    <div style={{ ...panel, marginTop: 20, gap: 14 }}>
      <Text size={54} color={gold}>
        {t.name}
      </Text>
      <Text size={48} color={gold}>
        GOALIE · {t.goalie?.status.toUpperCase() ?? "UNKNOWN"}
      </Text>
      <Text size={58} color={white}>
        {t.goalie?.name ?? "Assignment unavailable"}
      </Text>
      <Text size={48} color={white}>
        {t.goalie
          ? `${t.goalie.gaa?.toFixed(2) ?? "—"} GAA · ${t.goalie.sample} prior appearances`
          : "Goalie sample unavailable"}
      </Text>
      <Text size={30}>
        {t.goalie
          ? `RotoWire checked ${nhlStamp(t.goalie.source.retrieved_at)}`
          : "No verified assignment source"}
      </Text>
      <Text size={32}>
        GAA uses verified played minutes. Source-reported status is not final
        clearance.
      </Text>
      <Text size={48} color={gold}>
        PP1 · PROJECTED
      </Text>
      <Text size={44} color={white}>
        {t.powerPlay?.players.map((p) => p.name).join(" · ") || "Unavailable"}
      </Text>
      <Text size={30}>
        {t.powerPlay
          ? `Source checked ${nhlStamp(t.powerPlay.source.retrieved_at)}`
          : "Projected unit source unavailable"}
      </Text>
      <Text size={36}>
        Full 5-on-5 lines, injury clearance and late scratches are unavailable
        in this snapshot. Check current team reports before treating a player as
        active.
      </Text>
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
  return (
    <ResearchFrame
      badge="NHL RESEARCH"
      accent={s.teams.map((t) => t.abbreviation).join(" @ ")}
      title={
        page === 1
          ? "MATCHUP"
          : page <= 5
            ? "VOLUME"
            : page <= 7
              ? "BLOCKS"
              : "ROLES"
      }
      subtitle={
        page === 1
          ? "RECENT SCORING · GAME WINDOW · REST"
          : page <= 5
            ? "PLAYER SHOTS · GOALS · POINTS · ICE TIME"
            : page <= 7
              ? "BLOCKS · VERIFIED ICE-TIME DENOMINATORS"
              : "GOALIE STATUS · PROJECTED POWER PLAY"
      }
      meta={`${nhlStamp(s.game.start_time)} · PAGE ${page} OF 9 · DATA ${nhlStamp(s.collected_at)}`}
      footer="Research only · goals exclude shootout deciders. NHL.com / RotoWire. Full sources, samples and coverage gaps in The Zone."
    >
      {page === 1 ? (
        <Matchup s={s} />
      ) : page <= 5 ? (
        <Volume s={s} index={page - 2} />
      ) : page <= 7 ? (
        <Blocks s={s} index={page - 6} />
      ) : (
        <Roles s={s} index={page - 8} />
      )}
    </ResearchFrame>
  );
}
