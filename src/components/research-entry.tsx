"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { hubFilters, hubHref } from "@/lib/research-hub";
const LegacyResearch = dynamic(() => import("./research-feed"));
/** URL fragments are invisible to the server; retain older #release links before redirecting. */
export default function ResearchEntry() {
  const params = useSearchParams(),
    router = useRouter();
  const [legacy, setLegacy] = useState(false);
  useEffect(() => {
    if (/^#release-[\w-]+$/.test(window.location.hash)) setLegacy(true);
    else router.replace(hubHref(hubFilters(params)));
  }, [params, router]);
  return legacy ? (
    <LegacyResearch />
  ) : (
    <p role="status">Opening the Research lounge…</p>
  );
}
