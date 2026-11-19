import Link from "next/link";
import { notFound } from "next/navigation";
import { discoveryStagingEnabled } from "@/lib/discovery/access";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Access check | Vegas Quant staging",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  if (!discoveryStagingEnabled(process.env)) notFound();
  const unavailable = (await searchParams).reason === "unverified";
  return (
    <main className="shell">
      <section className="panel" aria-labelledby="access-heading">
        <p>ISOLATED STAGING · ACCESS CHECK</p>
        <h1 id="access-heading">
          {unavailable
            ? "Research access could not be verified"
            : "Research access is no longer available"}
        </h1>
        <p>
          Previously displayed research has been cleared. This page does not
          change your permissions.
        </p>
        <p>
          {unavailable
            ? "A failed access check is not proof that your membership was revoked. Retry to verify access."
            : "Sign in or review your existing access before reopening protected research."}
        </p>
        <p>
          <Link href="/membership">Sign in or review membership</Link>
        </p>
        <p>
          <Link href="/staging/discovery">
            Retry discovery with a fresh access check
          </Link>
        </p>
      </section>
    </main>
  );
}
