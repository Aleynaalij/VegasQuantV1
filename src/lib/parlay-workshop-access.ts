/** UI state only. Authoritative reads and writes remain protected by existing RLS/RPC gates. */
export type WorkshopAccess =
  | "checking"
  | "signed-out"
  | "denied"
  | "ready"
  | "failed";
type SessionResult = {
  data: { session: { user: { id: string } } | null };
  error: unknown;
};
type AccessResult = { data: { allowed?: boolean } | null; error: unknown };
export async function resolveWorkshopAccess(
  session: () => PromiseLike<SessionResult>,
  membership: () => PromiseLike<AccessResult>,
): Promise<{ state: WorkshopAccess; owner: string; message: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let owner = "";
  try {
    const result = await Promise.race([
      Promise.resolve(session()),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error("Session timeout")), 20000);
      }),
    ]);
    if (result.error) throw Error("Session unavailable");
    owner = result.data.session?.user.id || "";
    if (!owner) return { state: "signed-out", owner, message: "" };
    const access = await membership();
    if (access.error || typeof access.data?.allowed !== "boolean")
      return {
        state: "failed",
        owner,
        message: "Your research access could not be checked. Please retry.",
      };
    return {
      state: access.data.allowed ? "ready" : "denied",
      owner,
      message: "",
    };
  } catch {
    return {
      state: "failed",
      owner,
      message:
        "Your session or research access could not be checked. Please retry.",
    };
  } finally {
    clearTimeout(timer);
  }
}
