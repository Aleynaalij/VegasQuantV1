import { clv, gradePoints, type Desk, type Pick } from "./domain";
export function performance(d: Desk, picks: Pick[] = d.picks) {
  const rows = picks.map((p) => ({
    p,
    r: d.results.find((r) => r.pick_id === p.id),
    e: d.entries.find((e) => e.pick_id === p.id),
    c: d.closings.find((c) => c.pick_id === p.id),
    review: d.reviews
      .filter((r) => r.pick_id === p.id)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0],
  }));
  const settled = rows
    .filter((x) => x.r)
    .sort(
      (a, b) =>
        Date.parse(a.r!.created_at) - Date.parse(b.r!.created_at) ||
        a.p.id.localeCompare(b.p.id),
    );
  const avg = (a: number[]) =>
    a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const prices = rows
    .map((x) => clv(x.p, x.e, x.c).price)
    .filter((v): v is number => v !== null);
  let net = 0,
    peak = 0,
    drawdown = 0;
  const curve = settled.map((x) => {
    net += x.r!.profit_cents;
    peak = Math.max(peak, net);
    drawdown = Math.max(drawdown, peak - net);
    return { at: x.r!.created_at, net, selection: x.p.selection };
  });
  const wins = settled.filter((x) => x.r!.result === "WIN").length,
    losses = settled.filter((x) => x.r!.result === "LOSS").length;
  const risked = settled
    .filter((x) => x.r!.result !== "VOID")
    .reduce((n, x) => n + x.p.stake_cents, 0);
  return {
    rows,
    settled,
    curve,
    net,
    drawdown,
    wins,
    losses,
    pushes: settled.filter((x) => x.r!.result === "PUSH").length,
    voids: settled.filter((x) => x.r!.result === "VOID").length,
    pending: rows.length - settled.length,
    winRate: wins + losses ? (wins / (wins + losses)) * 100 : null,
    roi: risked ? (net / risked) * 100 : null,
    units: settled.reduce((n, x) => n + x.r!.profit_cents / x.p.stake_cents, 0),
    avgEdge: avg(rows.map((x) => x.p.edge)),
    avgConfidence: avg(rows.map((x) => x.p.confidence)),
    avgGrade: avg(
      rows.filter((x) => x.review).map((x) => gradePoints[x.review!.grade]),
    ),
    graded: rows.filter((x) => x.review).length,
    avgClv: avg(prices),
    clvCount: prices.length,
    clvWinRate: prices.length
      ? (prices.filter((x) => x > 0).length / prices.length) * 100
      : null,
    closingCount: rows.filter((x) => x.c).length,
    entryCount: rows.filter((x) => x.e).length,
  };
}
