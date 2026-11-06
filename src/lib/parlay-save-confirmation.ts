import type { MemberParlay } from "./parlay-builder";

type ReadResult<T> = { data: T | null; error: unknown };
type Read<T> = (signal: AbortSignal) => PromiseLike<ReadResult<T>>;

/** Both reads share one deadline. Aborting fetch alone is not a deadline for a stalled client. */
export async function confirmParlaySave(
  id: string,
  readCard: Read<MemberParlay>,
  readList: Read<MemberParlay[]>,
  timeoutMs = 20000,
): Promise<{ confirmed: MemberParlay | null; saved: MemberParlay[] | null }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let confirmed: MemberParlay | null = null;
  let saved: MemberParlay[] | null = null;
  let finished = false;
  const card = Promise.resolve()
    .then(() => readCard(controller.signal))
    .then((result) => {
      if (!finished && !result.error && result.data?.id === id)
        confirmed = result.data;
    })
    .catch(() => {});
  const list = Promise.resolve()
    .then(() => readList(controller.signal))
    .then((result) => {
      if (!finished && !result.error && Array.isArray(result.data))
        saved = result.data;
    })
    .catch(() => {});
  try {
    await Promise.race([
      Promise.all([card, list]),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
    return { confirmed, saved };
  } finally {
    finished = true;
    clearTimeout(timer);
    controller.abort();
  }
}
