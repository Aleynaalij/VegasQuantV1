import { supabase } from "./supabase";

export async function prepareAdminTotp(allowEnrollment: boolean) {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  const existing = data.totp.find((factor) => factor.status === "verified");
  if (existing) return { id: existing.id, qr: "", setupKey: "" };
  if (!allowEnrollment)
    throw new Error(
      "An administrator must provision your staging authenticator.",
    );

  // Incomplete enrollments cannot be resumed after leaving the setup page.
  for (const factor of data.all.filter(
    (factor) => factor.factor_type === "totp" && factor.status === "unverified",
  )) {
    const removed = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (removed.error) throw removed.error;
  }
  const enrolled = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Vegas Quant admin ${Date.now()}`,
  });
  if (enrolled.error) throw enrolled.error;
  return {
    id: enrolled.data.id,
    qr: enrolled.data.totp.qr_code,
    setupKey: enrolled.data.totp.secret,
  };
}
