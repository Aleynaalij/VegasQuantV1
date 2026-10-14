export type TailPublication = { result: string | null };
export function summarizeTails(rows: { publication?: TailPublication }[]) {
  const summary = { wins: 0, losses: 0, pushes: 0, voids: 0, pending: 0 };
  for (const row of rows) {
    switch (row.publication?.result) {
      case "WIN":
        summary.wins++;
        break;
      case "LOSS":
        summary.losses++;
        break;
      case "PUSH":
        summary.pushes++;
        break;
      case "VOID":
        summary.voids++;
        break;
      default:
        summary.pending++;
    }
  }
  return summary;
}
