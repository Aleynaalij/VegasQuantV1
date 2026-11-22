import { zoneDocument } from "@/design/zone-2/document";
export const dynamic = "force-dynamic";
/** Isolated design artifact. Never available on a production deployment. */
export function GET() {
  if (process.env.VERCEL_ENV !== "preview" && process.env.NODE_ENV !== "development") {
    return new Response("Not found", { status: 404 });
  }
  return new Response(zoneDocument, { headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; frame-ancestors 'self'; base-uri 'none'",
  }});
}
