export const ageConsentVersion = "2026-10-14";
export type AgeState =
  | "pending"
  | "requires_input"
  | "processing"
  | "verified"
  | "underage"
  | "needs_review"
  | "canceled";
export type AgeStatus = {
  required: boolean;
  verified: boolean;
  state: AgeState;
  version: number;
  provider_available?: boolean;
  retry_after?: string | null;
};
type DOB = { year: number | null; month: number | null; day: number | null };
export function isAtLeast21(
  dob: DOB | null | undefined,
  now = new Date(),
): boolean {
  if (
    !dob ||
    !Number.isInteger(dob.year) ||
    !Number.isInteger(dob.month) ||
    !Number.isInteger(dob.day)
  )
    return false;
  const { year, month, day } = dob as {
    year: number;
    month: number;
    day: number;
  };
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31)
    return false;
  const birth = new Date(Date.UTC(year, month - 1, day));
  if (
    birth.getUTCFullYear() !== year ||
    birth.getUTCMonth() !== month - 1 ||
    birth.getUTCDate() !== day
  )
    return false;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return (
    n("year") > year + 21 ||
    (n("year") === year + 21 &&
      (n("month") > month || (n("month") === month && n("day") >= day)))
  );
}
export type AgeProviderSession = {
  id: string;
  livemode: boolean;
  client_reference_id: string | null;
  metadata: Record<string, string>;
  type: string;
  status: string;
  options: {
    document?: {
      require_matching_selfie?: boolean;
      require_live_capture?: boolean;
    };
  } | null;
  verified_outputs?: { dob?: DOB | null } | null;
  redaction?: { status: string } | null;
};
export function verificationOutcome(
  s: AgeProviderSession,
  user: string,
  attempt: string,
  now = new Date(),
): AgeState {
  if (s.client_reference_id !== user || s.metadata.age_attempt_id !== attempt)
    throw Error("Verification owner mismatch");
  if (
    !s.livemode ||
    s.type !== "document" ||
    !s.options?.document?.require_matching_selfie ||
    !s.options.document.require_live_capture ||
    s.redaction
  )
    return "needs_review";
  if (s.status !== "verified")
    return s.status === "processing"
      ? "processing"
      : s.status === "canceled"
        ? "canceled"
        : "requires_input";
  const dob = s.verified_outputs?.dob;
  if (!dob || !dob.year || !dob.month || !dob.day) return "needs_review";
  // Invalid dates and unknown outputs must never be interpreted as a pass.
  const birth = new Date(Date.UTC(dob.year, dob.month - 1, dob.day));
  if (
    dob.year < 1900 ||
    dob.month < 1 ||
    dob.month > 12 ||
    dob.day < 1 ||
    birth.getUTCFullYear() !== dob.year ||
    birth.getUTCMonth() !== dob.month - 1 ||
    birth.getUTCDate() !== dob.day
  )
    return "needs_review";
  return isAtLeast21(dob, now) ? "verified" : "underage";
}
export function safeIdentityUrl(value: string | null): string {
  const u = new URL(value || "");
  if (
    u.protocol !== "https:" ||
    u.hostname !== "verify.stripe.com" ||
    u.username ||
    u.password
  )
    throw Error("Invalid verification destination");
  return u.href;
}
