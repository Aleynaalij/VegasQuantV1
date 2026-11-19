import type { FeatureCapabilities } from "./stage-feature-query";
/** Application identity, deliberately NOT a Supabase Session. No bearer tokens. */
export type ViewerUser = {
  id: string;
  email?: string;
  user_metadata: { name?: string; full_name?: string; avatar_url?: string };
  app_metadata: { provider?: string };
};
export type ViewerSession = {
  user: ViewerUser;
  transport: "httpOnly-stage" | "supabase";
  expires_at?: number;
};
export type ViewerIdentity = {
  state: "checking" | "ready" | "anonymous" | "denied" | "error";
  session: ViewerSession | null;
  age: "verified" | "unknown";
  capabilities: FeatureCapabilities;
  failure?: "logout";
};
export const unavailableCapabilities = {
  profile: false,
  notifications: false,
  social: false,
  desk: false,
  research: false,
} as const;
export const emptyViewer: ViewerIdentity = {
  state: "checking",
  session: null,
  age: "unknown",
  capabilities: unavailableCapabilities,
};
export function projectViewerUser(value: unknown): ViewerUser | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      v.id,
    )
  )
    return null;
  const out: ViewerUser = { id: v.id, user_metadata: {}, app_metadata: {} };
  if (typeof v.email === "string" && v.email.length <= 254) out.email = v.email;
  // Whitelist display fields only; never serialize arbitrary Auth metadata/identities.
  if (v.user_metadata && typeof v.user_metadata === "object") {
    const m = v.user_metadata as Record<string, unknown>;
    for (const k of ["name", "full_name", "avatar_url"] as const)
      if (typeof m[k] === "string" && m[k].length <= 512)
        out.user_metadata[k] = m[k];
  }
  if (v.app_metadata && typeof v.app_metadata === "object") {
    const p = (v.app_metadata as Record<string, unknown>).provider;
    if (typeof p === "string" && p.length <= 64) out.app_metadata.provider = p;
  }
  return out;
}
