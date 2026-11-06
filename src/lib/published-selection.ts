/** Use the publication's opaque key, never a guessed release or current-catalog position. */
export function publishedSelectionPath(legKey: string): string {
  return `/feed?view=selection&leg=${encodeURIComponent(legKey)}`;
}

/** Exact authorized lookup. A missing/withdrawn record never falls back to unrelated picks. */
export async function readPublishedSelection<T extends { leg_key: string }>(
  key: string,
  read: (
    signal: AbortSignal,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  timeoutMs = 10_000,
): Promise<T[]> {
  if (!key || key.length > 512 || /[\u0000-\u001f\u007f]/.test(key)) return [];
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      Promise.resolve(read(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Publication read timed out"));
        }, timeoutMs);
      }),
    ]);
    if (result.error) throw new Error("Publication could not load");
    const rows = result.data || [];
    if (rows.length > 1 || rows.some((row) => row.leg_key !== key))
      throw new Error("Publication identity did not match");
    return rows;
  } finally {
    clearTimeout(timer);
  }
}

export type PublishedTicketLeg = {
  leg_key?: string;
  name: string;
  market: string;
  matchup: string;
  why: string;
  risk: string;
};
type TicketIdentity = {
  leg_key: string;
  kind: string;
  release_id: string | null;
  leg_index: number | null;
};
/** The original release's one-based index is part of the immutable publication identity. */
export async function readPublishedTicketLegs(
  publication: TicketIdentity,
  read: (signal: AbortSignal) => PromiseLike<{
    data: { id: string; candidates: unknown }[] | null;
    error: unknown;
  }>,
  timeoutMs = 10_000,
): Promise<PublishedTicketLeg[]> {
  const {
    release_id: release,
    leg_index: index,
    leg_key: key,
    kind,
  } = publication;
  if (
    !release ||
    !Number.isSafeInteger(index) ||
    index! < 1 ||
    key !== `candidate:${release}:${index}` ||
    !["PARLAY", "HAIL_MARY"].includes(kind)
  )
    throw Error("Ticket publication identity is unavailable");
  // Reuse the bounded, exact-key reader for the release identity, never a current feed list.
  const result = await readPublishedSelection(
    release,
    async (signal) => {
      const response = await read(signal);
      return {
        error: response.error,
        data: response.data?.map((row) => ({ ...row, leg_key: row.id })) || [],
      };
    },
    timeoutMs,
  );
  const candidates = result[0]?.candidates;
  if (!Array.isArray(candidates)) throw Error("Original ticket is unavailable");
  const candidate = candidates[index! - 1];
  if (
    !candidate ||
    typeof candidate !== "object" ||
    !(kind === "PARLAY"
      ? candidate.parlay === true
      : candidate.fun_play === true)
  )
    throw Error("Original ticket does not match");
  const legs = kind === "PARLAY" ? candidate.parlay_legs : candidate.legs;
  if (!Array.isArray(legs) || !legs.length)
    throw Error("Original ticket details are unavailable");
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  return legs.map((leg, position) => {
    if (!leg || typeof leg !== "object")
      throw Error("Original ticket details are unavailable");
    const name = text(kind === "PARLAY" ? leg.name : leg.team);
    const market = kind === "PARLAY" ? text(leg.market) : "Moneyline";
    if (!name || !market)
      throw Error("Original ticket details are unavailable");
    const leafKey =
      Array.isArray(candidate.leg_keys) &&
      candidate.leg_keys.length === legs.length
        ? candidate.leg_keys[position]
        : undefined;
    return {
      ...(typeof leafKey === "string" && leafKey ? { leg_key: leafKey } : {}),
      name,
      market,
      matchup: text(leg.matchup),
      why: text(leg.why),
      risk: text(leg.risk),
    };
  });
}

/** Auth refresh can stall independently of the publication fetch. */
export async function readPublicationSession<T>(
  read: () => PromiseLike<T>,
  timeoutMs = 10_000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(read),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(Error("Session read timed out")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Ticket actions copy every real selection, and never send a bundle key as an individual leg. */
export function publishedTicketAction(legs: PublishedTicketLeg[]) {
  const texts = legs.map(
    (leg) => `${leg.name} ${leg.market.replace(/^Full game\s*[·:—-]\s*/i, "")}`,
  );
  return {
    selection: texts.join("\n"),
    ...(legs.every((leg) => leg.leg_key)
      ? { kalshiLegKeys: legs.map((leg) => leg.leg_key!) }
      : { kalshiTexts: texts }),
  };
}
