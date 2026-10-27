export type TailPublication = {
  result: string | null;
  result_source?: string | null;
  review_status?: string;
};
export function verifiedTailResult(publication?: TailPublication) {
  if (
    publication?.review_status === "CONFLICT" ||
    !publication?.result_source ||
    !/^https:\/\//.test(publication.result_source)
  )
    return "PENDING";
  return ["WIN", "LOSS", "PUSH", "VOID"].includes(publication.result || "")
    ? publication!.result!
    : "PENDING";
}
export function summarizeTails(rows: { publication?: TailPublication }[]) {
  const summary = { wins: 0, losses: 0, pushes: 0, voids: 0, pending: 0 };
  for (const row of rows) {
    switch (verifiedTailResult(row.publication)) {
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
