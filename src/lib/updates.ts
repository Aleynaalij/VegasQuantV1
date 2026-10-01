import type { Desk } from "./domain";
export type DeskUpdate = {
  id: string;
  at: string;
  kind: "Analysis" | "Market" | "Official play" | "Result";
  title: string;
  summary: string;
  changes: string[];
};
export function deskUpdates(d: Desk, gameId: string): DeskUpdate[] {
  const analyses = d.analyses
    .filter((a) => a.game_id === gameId)
    .sort((a, b) => a.version - b.version);
  const updates: DeskUpdate[] = analyses.map((a, i) => {
    const prior = analyses[i - 1];
    const changes = prior
      ? [
          ...new Set([
            ...Object.keys(a.sections),
            ...Object.keys(prior.sections),
          ]),
        ].filter((k) => (a.sections[k] ?? "") !== (prior.sections[k] ?? ""))
      : Object.keys(a.sections);
    const projections = prior
      ? [
          ...new Set([
            ...Object.keys(a.projections),
            ...Object.keys(prior.projections),
          ]),
        ].filter(
          (k) => (a.projections[k] ?? "") !== (prior.projections[k] ?? ""),
        )
      : [];
    return {
      id: a.id,
      at: a.created_at,
      kind: "Analysis",
      title: a.title,
      summary: prior
        ? `Version ${a.version} · ${changes.length} sections changed${projections.length ? ` · ${projections.length} projection fields changed` : ""}`
        : `Version ${a.version} · Initial analysis`,
      changes,
    };
  });
  const markets = d.markets
    .filter((m) => m.game_id === gameId)
    .sort((a, b) => a.observed_at.localeCompare(b.observed_at));
  markets.forEach((m, i) => {
    const prev = markets[i - 1];
    const changes = (["spread", "moneyline", "total"] as const)
      .filter((k) => m[k] !== prev?.[k] && m[k] !== null)
      .map(
        (k) =>
          `${k === "moneyline" ? "Moneyline" : k[0].toUpperCase() + k.slice(1)}: ${prev?.[k] ? `${prev[k]} → ` : ""}${m[k]}`,
      );
    updates.push({
      id: m.id,
      at: m.created_at,
      kind: "Market",
      title:
        m.kind === "opening"
          ? "Opening market recorded"
          : "Market snapshot added",
      summary: `Observed ${new Date(m.observed_at).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}`,
      changes,
    });
  });
  const picks = d.picks.filter((p) => p.game_id === gameId);
  picks.forEach((p) =>
    updates.push({
      id: p.id,
      at: p.created_at,
      kind: "Official play",
      title: "Official play published",
      summary: p.selection,
      changes: [`Published odds: ${p.odds > 0 ? "+" : ""}${p.odds}`],
    }),
  );
  d.results
    .filter((r) => picks.some((p) => p.id === r.pick_id))
    .forEach((r) =>
      updates.push({
        id: r.id,
        at: r.created_at,
        kind: "Result",
        title: `Result published: ${r.result}`,
        summary: picks.find((p) => p.id === r.pick_id)!.selection,
        changes: [],
      }),
    );
  return updates.sort(
    (a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id),
  );
}
