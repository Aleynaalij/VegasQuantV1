import { notFound } from "next/navigation";
import { BlackboxAccess } from "@/components/blackbox-access";
import { Shell } from "@/components/ui";
import { blackboxEnabled } from "@/lib/blackbox";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Blackbox staging",
  robots: { index: false, follow: false },
};

export default function Page() {
  if (!blackboxEnabled()) notFound();
  return (
    <Shell active="admin">
      <article className="vq-policy">
        <BlackboxAccess />
      </article>
    </Shell>
  );
}
