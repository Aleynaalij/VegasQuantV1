"use client";
import { viewerAuth } from "@/lib/viewer-auth";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import GameIntelligenceRoom from "./game-intelligence-room";
import { readResearchHub, type HubData } from "@/lib/research-hub-reader";
import { watchDiscoveryAccess } from "@/lib/discovery/revalidate";
import { fixtureScenario } from "@/lib/discovery/fixtures";
import { supabase } from "@/lib/supabase";
import type { RoomReference } from "@/lib/game-room";
const EMPTY: HubData = {
  events: [],
  findings: [],
  errors: [],
  denied: true,
  signedIn: false,
  truncated: false,
};
export default function GameRoomClient({
  reference,
  fixtures = false,
  linkedPublications = false,
  scenario = null,
  homeHref = "/staging/discovery",
  zoneHref = "/community",
}: {
  reference: RoomReference;
  fixtures?: boolean;
  linkedPublications?: boolean;
  scenario?: string | null;
  homeHref?: string;
  zoneHref?: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<HubData>(EMPTY);
  const [loading, setLoading] = useState(true),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  const hadAccess = useRef(false);
  useEffect(() => {
    let active = true,
      generation = 0;
    function invalidate() {
      ++generation;
      setData(EMPTY);
      setLoading(true);
    }
    async function load() {
      const own = ++generation;
      setData(EMPTY);
      setLoading(true);
      setFailed(false);
      try {
        const result = fixtures
          ? fixtureScenario(scenario)
          : await readResearchHub();
        if (!active || own !== generation) return;
        if (
          !fixtures &&
          hadAccess.current &&
          (!result.signedIn || result.denied)
        ) {
          router.replace("/staging/discovery/access-denied?reason=denied");
          return;
        }
        if (!fixtures && result.signedIn && !result.denied)
          hadAccess.current = true;
        setData(result);
      } catch {
        if (!active || own !== generation) return;
        setFailed(true);
        if (!fixtures && hadAccess.current)
          router.replace("/staging/discovery/access-denied?reason=unverified");
      } finally {
        if (active && own === generation) setLoading(false);
      }
    }
    void load();
    const stop = fixtures
      ? () => {}
      : watchDiscoveryAccess(
          invalidate,
          () => void load(),
          (changed) => {
            const { data } = viewerAuth.onAuthStateChange(changed);
            return () => data.subscription.unsubscribe();
          },
        );
    return () => {
      active = false;
      ++generation;
      stop();
    };
  }, [fixtures, scenario, attempt, router, reference.sport, reference.id]);
  return (
    <>
      <p className="gr-staging">
        ISOLATED STAGING ·{" "}
        {fixtures
          ? "Synthetic test records, not live research or permissions."
          : "Existing authorized staging reader. Not production."}
      </p>
      <GameIntelligenceRoom
        key={`${reference.sport}:${reference.id}`}
        data={data}
        linkedPublications={linkedPublications && !fixtures}
        homeHref={homeHref}
        zoneHref={zoneHref}
        reference={reference}
        loading={loading}
        failed={failed}
        refresh={() => setAttempt((a) => a + 1)}
      />
    </>
  );
}
