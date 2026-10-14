export type IdentityErasureProvider = {
  retrieve(
    id: string,
  ): Promise<{
    client_reference_id: string | null;
    metadata: Record<string, string>;
    status: string;
    redaction: { status: string } | null;
  }>;
  redact(id: string): Promise<unknown>;
};
export async function redactIdentityAttempts(
  user: string,
  attempts: { id: string; provider_session: string }[],
  provider: IdentityErasureProvider,
) {
  const ids: string[] = [];
  // Verify every reference before requesting any irreversible redaction.
  for (const a of attempts) {
    const s = await provider.retrieve(a.provider_session);
    if (
      s.redaction?.status === "processing" ||
      s.redaction?.status === "redacted"
    )
      continue;
    if (s.client_reference_id !== user || s.metadata.age_attempt_id !== a.id)
      throw Error("Identity owner mismatch");
    if (s.status !== "requires_input" && s.status !== "verified")
      throw Error("Identity processing must finish before deletion");
    ids.push(a.provider_session);
  }
  for (const id of ids) await provider.redact(id);
}
