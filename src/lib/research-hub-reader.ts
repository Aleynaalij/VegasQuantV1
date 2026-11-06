import { supabase } from "./supabase";
import type { Analysis, Market } from "./domain";
import { researchFacts } from "./research-facts";
import { publicationSources } from "./game-research";
import {
  footballNews,
  gameResearchTopics,
  memberResearchText,
  type GameNewsRow,
} from "./game-research";
import {
  latestNbaObservations,
  nbaOutcomes,
  nbaMarkets,
  type NbaObservation,
} from "./nba-board";
import { sportInjuries, marketLine, MARKET_LABEL } from "./sport-page";
import type { SportPage } from "./sport-contract";
import {
  safeSource,
  eventFinding,
  type ResearchEvent,
  type Finding,
} from "./research-hub";
import type { Sport } from "./sports";
export type HubData = {
  events: ResearchEvent[];
  findings: Finding[];
  errors: string[];
  denied: boolean;
  signedIn: boolean;
  truncated: boolean;
};
const str = (v: unknown) => (typeof v === "string" ? v : "");
const sources = (...values: unknown[]) => [
  ...new Set(values.map(safeSource).filter((x): x is string => !!x)),
];
export function sportFindings(e: ResearchEvent, page: SportPage): Finding[] {
  if (
    page.sport !== e.sport ||
    !page.access ||
    !page.games.some((g) => g.id === e.id && g.sport === e.sport)
  )
    return [];
  const out: Finding[] = [];
  for (const f of page.facts.filter((f) => f.game_id === e.id)) {
    const p = f.payload,
      injury = sportInjuries([f], e.id),
      text = injury.lines
        .map((i) => `${i.team} · ${i.player}: ${i.status}`)
        .join("\n");
    if (text)
      out.push({
        id: f.id + ":injuries",
        eventKey: e.key,
        topic: "injuries",
        title: "Reported availability",
        text,
        sources: sources(f.source?.url),
        sourceAt: null,
        recordedAt: f.source?.retrieved_at || null,
        label: "Provider report",
      });
    // Only named reader-facing fields; raw provider payloads are not dumped into the product.
    const context = [
      "availability",
      "goalie_confirmation",
      "note",
      "summary",
      "team_form",
    ]
      .flatMap((k) =>
        typeof p[k] === "string" ? [`${k.replaceAll("_", " ")}: ${p[k]}`] : [],
      )
      .join("\n");
    if (context)
      out.push({
        id: f.id + ":context",
        eventKey: e.key,
        topic: "context",
        title: "Team context",
        text: context,
        sources: sources(f.source?.url),
        sourceAt: null,
        recordedAt: f.source?.retrieved_at || null,
        label: "Provider report",
      });
  }
  for (const m of page.markets.filter(
    (m) => m.game_id === e.id && m.sport === e.sport,
  ))
    out.push({
      id: m.id,
      eventKey: e.key,
      topic: "markets",
      title: `${m.player ? m.player + " · " : ""}${MARKET_LABEL[m.market] || m.market}`,
      text: `${marketLine(m)} · ${m.odds > 0 ? "+" : ""}${m.odds} at ${m.book}\n${m.settlement_note || ""}`,
      sources: sources(m.source?.url),
      sourceAt: m.observed_at,
      recordedAt: m.source?.retrieved_at || null,
      label: "Observed quote",
    });
  for (const s of page.selections.filter((s) => s.game_id === e.id))
    out.push({
      id: s.id,
      eventKey: e.key,
      topic: "overview",
      title: s.title,
      text: `${s.why}\n\nRisk: ${s.risk}`,
      sources: sources(...(s.sources || []).map((s) => s.url)),
      sourceAt: null,
      recordedAt: s.published_at,
      label: "Published research",
    });
  return out;
}
export function nbaFindings(
  e: ResearchEvent,
  observations: NbaObservation[],
): Finding[] {
  if (e.sport !== "nba") return [];
  return latestNbaObservations(
    observations.filter((r) => r.game_id === e.id),
  ).flatMap((r) => {
    const injury = r.kind === "injury",
      p = r.payload;
    if (!injury && r.kind !== "odds" && r.kind !== "prop") return [];
    const text = injury
      ? `${str(p.team)} · ${str(p.player) || "Player not supplied"}: ${str(p.status) || "Status not supplied"}${p.detail ? "\n" + str(p.detail) : ""}`
      : `${str(p.book) || r.provider} · ${str(p.player)}\n${nbaOutcomes(p)
          .map(
            (o) =>
              `${o.name}${o.point !== null ? " " + o.point : ""} (${o.price})`,
          )
          .join(" · ")}`;
    const item = eventFinding(e, r, {
      id: r.id,
      topic: injury ? "injuries" : "markets",
      title: injury
        ? "Reported availability"
        : nbaMarkets[str(p.market)] || "Market snapshot",
      text,
      sources: sources(r.source),
      sourceAt: r.observed_at,
      recordedAt: r.recorded_at,
      label: injury ? "Provider report" : "Observed quote",
    });
    return item ? [item] : [];
  });
}
export function nflFindings(
  e: ResearchEvent,
  versions: (Analysis & { intelligence?: Record<string, unknown> })[],
  news: (GameNewsRow & { game_id: string; category: string })[],
  markets: Market[],
): Finding[] {
  if (e.sport !== "nfl") return [];
  const own = versions.filter((a) => a.game_id === e.id),
    latest = Math.max(0, ...own.map((a) => a.version));
  const out: Finding[] = gameResearchTopics(own, latest).flatMap((t) =>
    t.items.map((item, i) => ({
      id: `${e.id}:${t.id}:${i}`,
      eventKey: e.key,
      topic: (t.id === "injuries" || t.id === "weather" || t.id === "overview"
        ? t.id
        : t.id === "market"
          ? "markets"
          : "context") as Finding["topic"],
      title: item.heading,
      text: item.text,
      sources: item.sources,
      sourceAt: null,
      recordedAt: item.at,
      label: "Published research" as const,
    })),
  );
  // Snapshots inherit unchanged fields: keep the original publication date for that field.
  const history = [...own].sort((a, b) => b.version - a.version);
  for (const [field, topic, title] of [
    ["injuries", "injuries", "Availability briefing"],
    ["weather", "weather", "Venue weather briefing"],
    ["teams", "context", "Team context briefing"],
  ] as const) {
    const latest = history.find((a) => a.intelligence?.[field] != null);
    if (!latest) continue;
    const value = latest.intelligence![field];
    let origin = latest;
    for (const earlier of history.filter((a) => a.version < latest.version)) {
      if (earlier.intelligence?.[field] == null) continue;
      if (JSON.stringify(earlier.intelligence[field]) !== JSON.stringify(value))
        break;
      origin = earlier;
    }
    const groups = researchFacts(value);
    const text = groups
      .map((g) =>
        g.map((f) => `${f.label ? f.label + ": " : ""}${f.value}`).join("\n"),
      )
      .join("\n\n");
    if (!text) continue;
    const details =
      value && !Array.isArray(value) && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
    out.push({
      id: `${e.id}:structured:${field}`,
      eventKey: e.key,
      topic,
      title,
      text,
      sources: sources(
        ...publicationSources(origin),
        details.source,
        details.source_url,
      ),
      sourceAt: str(details.observed_at) || str(details.issued_at) || null,
      recordedAt: origin.created_at,
      label: "Published research",
    });
  }
  for (const r of footballNews(news.filter((n) => n.game_id === e.id))) {
    const original = news.find((n) => n.id === r.id)!;
    out.push({
      id: r.id,
      eventKey: e.key,
      topic:
        original.category === "Injury watch"
          ? "injuries"
          : original.category === "Market update"
            ? "markets"
            : "overview",
      title: r.title,
      text: [r.summary, r.why_watch, r.caution]
        .map(memberResearchText)
        .filter(Boolean)
        .join("\n\n"),
      sources: sources(r.source_url),
      sourceAt: r.source_at,
      recordedAt: r.created_at,
      label: "Published research",
    });
  }
  for (const m of markets.filter((m) => m.game_id === e.id))
    out.push({
      id: m.id,
      eventKey: e.key,
      topic: "markets",
      title: `${m.kind === "opening" ? "Opening" : "Stored"} market snapshot`,
      text: [
        m.spread && `Spread: ${m.spread}`,
        m.moneyline && `Moneyline: ${m.moneyline}`,
        m.total && `Total: ${m.total}`,
      ]
        .filter(Boolean)
        .join("\n"),
      sources: sources(m.source),
      sourceAt: m.observed_at,
      recordedAt: m.created_at,
      label: "Observed quote",
    });
  return out;
}
/** Reads existing RLS-protected stores only. Provider collection and publication remain separate. */
export async function readResearchHub(): Promise<HubData> {
  const now = new Date(),
    end = new Date(now.getTime() + 7 * 86400000).toISOString(),
    start = new Date(now.getTime() - 6 * 3600000).toISOString();
  const data: HubData = {
    events: [],
    findings: [],
    errors: [],
    denied: true,
    signedIn: false,
    truncated: false,
  };
  const [session, access] = await Promise.all([
    supabase.auth.getSession(),
    supabase.rpc("membership_status"),
  ]);
  data.signedIn = !!session.data.session;
  data.denied = !!access.error || access.data?.allowed !== true;
  if (access.error)
    data.errors.push(
      "Research access could not be checked. Retry to check access.",
    );
  const add = (s: Sport, e: Omit<ResearchEvent, "key" | "sport">) => {
    if (
      !e.id ||
      !e.slug ||
      !e.away ||
      !e.home ||
      !Number.isFinite(Date.parse(e.start)) ||
      /FINAL|CANCEL/.test(e.status)
    )
      return;
    data.events.push({ ...e, key: `${s}:${e.id}`, sport: s });
  };
  await Promise.all(
    (["nfl", "nba", "nhl", "ncaab"] as Sport[]).map(async (sport) => {
      try {
        if (sport === "nfl") {
          const r = await supabase
            .from("games")
            .select(
              "id,slug,away_team,home_team,kickoff,kickoff_tbd,venue,roof,schedule_source,schedule_observed_at",
            )
            .eq("sport", "nfl")
            .gte("kickoff", start)
            .lt("kickoff", end)
            .order("kickoff")
            .limit(500);
          if (r.error) throw r.error;
          for (const g of r.data || [])
            add(sport, {
              id: g.id,
              slug: g.slug,
              away: g.away_team,
              home: g.home_team,
              start: g.kickoff,
              tbd: !!g.kickoff_tbd,
              venue: g.venue,
              roof: g.roof,
              status: "Schedule supplied",
              source: safeSource(g.schedule_source),
              scheduleAt: g.schedule_observed_at,
            });
        } else if (sport === "nba") {
          const r = await supabase
            .from("nba_games")
            .select(
              "id,slug,away_team,home_team,away_abbreviation,home_abbreviation,tipoff,tipoff_tbd,venue,status,source,updated_at",
            )
            .gte("tipoff", start)
            .lt("tipoff", end)
            .order("tipoff")
            .limit(500);
          if (r.error) throw r.error;
          for (const g of r.data || [])
            add(sport, {
              id: g.id,
              slug: g.slug,
              away: g.away_team,
              home: g.home_team,
              start: g.tipoff,
              tbd: !!g.tipoff_tbd,
              venue: g.venue,
              status: g.status || "Status unavailable",
              source: safeSource(g.source),
              scheduleAt: null,
              awayAbbreviation: g.away_abbreviation || undefined,
              homeAbbreviation: g.home_abbreviation || undefined,
            });
        } else {
          const r = await supabase.rpc("sports_slate", {
            p_sport: sport,
            p_days: 7,
          });
          if (
            r.error ||
            r.data?.version !== 1 ||
            r.data.sport !== sport ||
            !Array.isArray(r.data.games)
          )
            throw Error("Schedule unavailable");
          const page = r.data as SportPage;
          for (const g of page.games)
            if (g.sport === sport && !g.completed)
              add(sport, {
                id: g.id,
                slug: g.slug,
                away: g.away?.name,
                home: g.home?.name,
                start: g.start_time,
                tbd: !!g.start_time_tbd,
                venue: g.venue,
                status: g.status,
                source: safeSource(g.source?.url),
                scheduleAt: null,
              });
          if (!data.denied && page.access)
            for (const e of data.events.filter((e) => e.sport === sport))
              data.findings.push(...sportFindings(e, page));
          if (!data.denied && !page.access)
            data.errors.push(
              `${sport.toUpperCase()} protected research access was denied.`,
            );
        }
      } catch {
        data.errors.push(
          `${sport.toUpperCase()} schedule or research source unavailable. Retry to check this sport.`,
        );
      }
    }),
  );
  if (!data.denied)
    await Promise.all(
      ["nfl", "nba"].map(async (sport) => {
        const ids = data.events
          .filter((e) => e.sport === sport)
          .map((e) => e.id);
        if (!ids.length) return;
        try {
          if (sport === "nba") {
            const r = await supabase
              .from("nba_observations")
              .select(
                "id,game_id,kind,provider,source,observed_at,recorded_at,payload",
              )
              .in("game_id", ids)
              .in("kind", ["injury", "odds", "prop"])
              .gte(
                "recorded_at",
                new Date(now.getTime() - 48 * 3600000).toISOString(),
              )
              .order("recorded_at", { ascending: false })
              .limit(1000);
            if (r.error) throw r.error;
            if (r.data?.length === 1000) data.truncated = true;
            for (const e of data.events.filter((e) => e.sport === sport))
              data.findings.push(
                ...nbaFindings(e, (r.data || []) as NbaObservation[]),
              );
          } else {
            const results = await Promise.all([
              supabase
                .from("analysis_versions")
                .select(
                  "id,game_id,version,title,sections,source,created_at,intelligence",
                )
                .in("game_id", ids)
                .order("version", { ascending: false })
                .limit(500),
              supabase
                .from("research_feed_posts")
                .select(
                  "id,game_id,category,title,summary,why_watch,caution,source_url,source_at,created_at",
                )
                .in("game_id", ids)
                .order("created_at", { ascending: false })
                .limit(500),
              supabase
                .from("market_snapshots")
                .select(
                  "id,game_id,observed_at,created_at,source,spread,moneyline,total,kind,notes",
                )
                .in("game_id", ids)
                .order("observed_at", { ascending: false })
                .limit(500),
            ]);
            const [a, n, m] = results;
            if (results.some((r) => r.error))
              data.errors.push(
                "Some NFL research sources could not load. Available sections are partial; retry.",
              );
            if (results.some((r) => r.data?.length === 500))
              data.truncated = true;
            for (const e of data.events.filter((e) => e.sport === sport))
              data.findings.push(
                ...nflFindings(
                  e,
                  (a.data || []) as (Analysis & {
                    intelligence?: Record<string, unknown>;
                  })[],
                  (n.data || []) as (GameNewsRow & {
                    game_id: string;
                    category: string;
                  })[],
                  (m.data || []) as Market[],
                ),
              );
          }
        } catch {
          data.errors.push(
            `${sport.toUpperCase()} research unavailable. Schedule availability does not confirm research coverage.`,
          );
        }
      }),
    );
  data.events.sort(
    (a, b) =>
      Date.parse(a.start) - Date.parse(b.start) || a.key.localeCompare(b.key),
  );
  return data;
}
