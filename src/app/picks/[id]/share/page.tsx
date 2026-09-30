import { getDesk } from "@/lib/data";
import { notFound } from "next/navigation";
import PickCard from "@/components/pick-card";
import Link from "next/link";
import { Activity, Download } from "lucide-react";
export const dynamic = "force-dynamic";
export default async function Share({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const d = await getDesk(),
    p = d.picks.find((p) => p.id === id);
  if (!p) notFound();
  return (
    <main className="share-page">
      <Link className="brand" href="/">
        <Activity />
        VEGAS QUANT
      </Link>
      <p className="eyebrow">
        THE 5-SPOT CHALLENGE · ANALYST OF RECORD: VEGAS QUANT ULTRA
      </p>
      <PickCard p={p} d={d} share />
      <a
        className="primary"
        href={`/picks/${p.id}/image`}
        download={`vegas-quant-${p.id}.png`}
      >
        <Download size={16} />
        Download share card
      </a>
      <p className="muted">
        Entertainment challenge. No wager is guaranteed. A stage may be passed
        when no qualifying edge exists.
      </p>
    </main>
  );
}
