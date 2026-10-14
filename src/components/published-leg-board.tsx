"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import LegActions from "./leg-actions";
import PriceFreshness from "./price-freshness";
import GamblyLink from "./gambly-link";
type Leg = {
  leg_key: string;
  name: string;
  market: string;
  matchup: string;
  quote: string;
  quote_observed_at: string | null;
  published_at: string;
  expires_at: string;
  kind: string;
  result: string | null;
  result_source: string | null;
  game_id: string | null;
  gambly_url: string | null;
  copy_text: string | null;
  why: string;
  risk: string;
};
export default function PublishedLegBoard({
  savedOnly = false,
}: {
  savedOnly?: boolean;
}) {
  const [rows, setRows] = useState<Leg[]>([]),
    [filter, setFilter] = useState("ALL"),
    [search, setSearch] = useState(""),
    [notice, setNotice] = useState("Loading publication snapshots…"),
    [limit, setLimit] = useState(30),
    [retry, setRetry] = useState(0),
    [failed, setFailed] = useState(false),
    [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    let epoch = 0;
    async function load() {
      const n = ++epoch;
      try {
        const s = await supabase.auth.getSession();
        if (!live || n !== epoch) return;
        if (!s.data.session) {
          if (live) {
            setFailed(false);
            setSignedIn(false);
            setRows([]);
            setNotice(
              "Sign in to view published selections and your saved legs.",
            );
          }
          return;
        }
        setSignedIn(true);
        let q = supabase
          .from("published_legs")
          .select("*")
          .order("published_at", { ascending: false });
        if (savedOnly) {
          const a = await supabase
            .from("saved_legs")
            .select("leg_key")
            .eq("user_id", s.data.session.user.id);
          if (!live || n !== epoch) return;
          if (a.error) {
            setFailed(true);
            setNotice("Saved legs could not load.");
            return;
          }
          if (!a.data?.length) {
            setFailed(false);
            setRows([]);
            setNotice("No saved legs yet. Tap Save leg on any selection.");
            return;
          }
          q = q.in(
            "leg_key",
            a.data.map((r) => r.leg_key),
          );
        }
        const r = await q.limit(1000);
        if (live && n === epoch) {
          setFailed(!!r.error);
          if (!r.error) setRows(r.data || []);
          setNotice(
            r.error
              ? "Records could not load. Please retry."
              : r.data?.length
                ? ""
                : "No published selections yet.",
          );
        }
      } catch {
        if (live && n === epoch) {
          setFailed(true);
          setNotice("Records could not load. Please retry.");
        }
      }
    }
    void load();
    const refresh = () => {
      if (live) void load();
    };
    window.addEventListener("vq-saved-changed", refresh);
    const auth = supabase.auth.onAuthStateChange((event) => {
      ++epoch;
      if (event === "SIGNED_OUT" || event === "SIGNED_IN") {
        setRows([]);
        setSignedIn(null);
      }
      setTimeout(refresh, 0);
    });
    return () => {
      live = false;
      auth.data.subscription.unsubscribe();
      window.removeEventListener("vq-saved-changed", refresh);
    };
  }, [savedOnly, retry]);
  const visible = rows.filter(
    (r) =>
      (filter === "ALL" || r.kind === filter) &&
      `${r.name} ${r.market} ${r.matchup}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <section className="published-board">
      <h2>{savedOnly ? "Your saved legs" : "Every published selection"}</h2>
      <p>
        Original publication snapshots stay on record. Singles, Pick of the Day
        and Hail Mary tickets are shown separately. Unverified outcomes stay
        ungraded.
      </p>
      {signedIn === null ? (
        <p role="status">Loading publication snapshots…</p>
      ) : !signedIn ? (
        <p role="status">
          {notice}{" "}
          <Link className="text-link" href="/membership">
            Sign in or create a free account →
          </Link>
        </p>
      ) : (
        <>
          <input
            aria-label="Search published selections"
            placeholder="Search player, team or matchup"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(30);
            }}
          />
          <div className="board-filters">
            {["ALL", "SINGLE", "PICK_OF_DAY", "HAIL_MARY", "OFFICIAL"].map(
              (f) => (
                <button
                  key={f}
                  aria-pressed={filter === f}
                  onClick={() => {
                    setFilter(f);
                    setLimit(30);
                  }}
                >
                  {f.replaceAll("_", " ")}
                </button>
              ),
            )}
          </div>
          {!notice && (
            <p>
              {visible.length} publication snapshots ·{" "}
              {visible.filter((r) => r.result && r.result_source).length}{" "}
              sourced results
            </p>
          )}
          {notice && (
            <p role="status">
              {notice}{" "}
              {failed && (
                <button
                  className="text-link"
                  onClick={() => setRetry((n) => n + 1)}
                >
                  Retry
                </button>
              )}
            </p>
          )}
          {!notice && !visible.length && (
            <p role="status">No selections match this search or filter.</p>
          )}
          {visible.slice(0, limit).map((r) => (
            <article className="leg-record" key={r.leg_key}>
              <div className="record-meta">
                <span>{r.kind.replaceAll("_", " ")}</span>
                <strong>
                  {r.result && r.result_source ? r.result : "UNGRADED"}
                </strong>
              </div>
              <h3>
                {r.name} · {r.market}
              </h3>
              <p>{r.matchup}</p>
              <b>{r.quote || "Price not verified"}</b>
              <PriceFreshness at={r.quote_observed_at} />
              <small>
                Published{" "}
                {new Date(r.published_at).toLocaleString("en-US", {
                  timeZone: "America/New_York",
                })}{" "}
                ET ·{" "}
                <span title={r.leg_key}>Ref {r.leg_key.slice(-8)}</span>
              </small>
              <details>
                <summary>Case & loss risk</summary>
                <p>{r.why}</p>
                <p>
                  <strong>Could lose:</strong> {r.risk}
                </p>
              </details>
              {r.result_source && /^https:\/\//.test(r.result_source) && (
                <a
                  href={r.result_source}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Result source ↗
                </a>
              )}
              <LegActions
                legKey={r.leg_key}
                expired={Date.parse(r.expires_at) <= Date.now()}
              />
              {r.gambly_url && Date.parse(r.expires_at) > Date.now() && (
                <GamblyLink
                  url={r.gambly_url}
                  selection={
                    r.copy_text || `${r.name} ${r.market} · ${r.matchup}`
                  }
                />
              )}
              {r.game_id && (
                <Link href={`/sweat/${r.game_id}`}>Open game discussion →</Link>
              )}
            </article>
          ))}
          {visible.length > limit && (
            <button onClick={() => setLimit((l) => l + 30)}>
              Show more publications
            </button>
          )}
        </>
      )}
    </section>
  );
}
