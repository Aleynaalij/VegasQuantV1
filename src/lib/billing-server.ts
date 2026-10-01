import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, publishableKey } from "./supabase";
export function billingMode() {
  return process.env.STRIPE_MODE === "live" ? "live" : "test";
}
export function billingEnabled() {
  const mode = billingMode();
  return Boolean(
    process.env.STRIPE_SECRET_KEY?.startsWith(
      mode === "test" ? "sk_test_" : "sk_live_",
    ) &&
      process.env.STRIPE_WEBHOOK_SECRET &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.BILLING_ENABLED === "true" &&
      (mode === "test" || process.env.STRIPE_LIVE_APPROVED === "true"),
  );
}
export function stripeClient() {
  if (!billingEnabled()) throw new Error("Checkout is not configured.");
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}
export function serviceDb() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("Billing database is not configured");
  return createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function requestUser(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  const db = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await db.auth.getUser(token);
  return error || !data.user?.email_confirmed_at
    ? null
    : { user: data.user, db };
}
export function appOrigin() {
  return new URL(process.env.APP_URL || "https://vegasquant.app")
    .origin;
}
