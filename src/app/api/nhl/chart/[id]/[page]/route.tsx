import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import { publishableKey, supabaseUrl } from "@/lib/supabase";
import { NhlChartImage } from "@/components/nhl-chart-image";
import { isNhlChart } from "@/lib/nhl-chart-package";
export const runtime = "nodejs";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; page: string }> },
) {
  const { id, page: p } = await params;
  const page = Number(p);
  if (!/^[0-9a-f-]{36}$/i.test(id) || ![1, 2, 3].includes(page))
    return new Response("Unknown chart", { status: 404 });
  const db = createClient(supabaseUrl, publishableKey);
  const r = await db.rpc("nhl_chart_snapshot", { p_id: id });
  if (r.error)
    return new Response("Chart unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  if (!isNhlChart(r.data)) return new Response("No chart", { status: 404 });
  const fonts = await Promise.all(
    [
      "barlow-condensed-800-latin.ttf",
      "dm-sans-500.ttf",
      "dm-sans-700.ttf",
    ].map((f) => readFile(path.join(process.cwd(), "src/assets/fonts", f))),
  );
  return new ImageResponse(<NhlChartImage s={r.data} page={page} />, {
    width: 1080,
    height: 1350,
    fonts: [
      { name: "Barlow Condensed", data: fonts[0], weight: 800 },
      { name: "DM Sans", data: fonts[1], weight: 500 },
      { name: "DM Sans", data: fonts[2], weight: 700 },
    ],
    headers: { "Cache-Control": "public,max-age=600,s-maxage=86400" },
  });
}
