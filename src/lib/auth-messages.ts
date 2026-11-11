// Plain-language messages for the sign-up / sign-in form. Raw auth errors ("For security purposes, you can
// only request this after 53 seconds") confused new members; these say what happened and what to do next.

export const RESEND_COOLDOWN_SECONDS = 60;

type AuthLikeError = { code?: unknown; message?: unknown } | null | undefined;

export function authErrorCode(e: unknown): string {
  const code = (e as AuthLikeError)?.code;
  return typeof code === "string" ? code : "";
}

/** Seconds the auth server asked us to wait, if the error says so. */
export function retryAfterSeconds(e: unknown): number | null {
  const message = (e as AuthLikeError)?.message;
  if (typeof message !== "string") return null;
  const m = /after (\d+) seconds?/i.exec(message);
  return m ? Number(m[1]) : null;
}

export function authErrorMessage(
  e: unknown,
  fallback = "Sign in failed.",
): string {
  const code = authErrorCode(e);
  if (code === "over_email_send_rate_limit") {
    const wait = retryAfterSeconds(e);
    return `We just sent you an email. Please wait${wait ? ` ${wait} seconds` : " a minute"} before asking for another, and use the newest email — each new one replaces the link in the last.`;
  }
  if (code === "email_not_confirmed")
    return "Your email isn’t confirmed yet. Open the newest confirmation email from VegasQuant (check spam or junk), or resend it below.";
  if (code === "invalid_credentials")
    return "That email and password don’t match. Check both, or use Forgot password.";
  if (code === "over_request_rate_limit")
    return "Too many attempts. Please wait a minute and try again.";
  if (code === "weak_password")
    return "Choose a stronger password (at least 8 characters).";
  if (code === "request_timeout")
    return "The server took too long to respond. Wait a moment, then try again — don’t register twice.";
  const message = (e as AuthLikeError)?.message;
  return typeof message === "string" && message ? message : fallback;
}

/**
 * A sign-up for an address that already has a confirmed account returns a placeholder user with no
 * identities and sends no email; tell the person to sign in instead of waiting for an email.
 */
export function signupAlreadyRegistered(
  user: { identities?: unknown[] | null } | null | undefined,
): boolean {
  return (
    !!user && Array.isArray(user.identities) && user.identities.length === 0
  );
}

export const CHECK_EMAIL_NOTICE =
  "Check your email for a confirmation link from VegasQuant (look in spam or junk too), then return here to sign in. If it hasn’t arrived in a few minutes, resend it below. If you entered a friends code, activate it after signing in.";
