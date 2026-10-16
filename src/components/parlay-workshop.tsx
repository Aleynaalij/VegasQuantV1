"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { homeWeekStart } from "@/lib/home-week";
import {
  canBuildWith,
  parlayCopy,
  parlayCopyLine,
  selectionError,
  weeklyLegs,
  type MemberParlay,
  type PublishedLeg,
} from "@/lib/parlay-builder";
import GamblyLink from "./gambly-link";
import CasinoCard, { CasinoCardDownload } from "./casino-card";
import { cleanMarket, type CasinoCardData } from "@/lib/casino-card";

export default function ParlayWorkshop({
  mode,
}: {
  mode: "catalog" | "parlays";
}) {
  const [rows, setRows] = useState<PublishedLeg[]>([]);
  const [saved, setSaved] = useState<MemberParlay[]>([]);
  const [chosen, setChosen] = useState<PublishedLeg[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const [title, setTitle] = useState("My parlay");
  const epoch = useRef(0);
  const builder = useRef<HTMLElement>(null);
  useEffect(() => {
    let live = true;
    async function load() {
      const n = ++epoch.current;
      setLoading(true);
      setChosen([]);
      setSaved([]);
      setRows([]);
      setError("");
      const [catalog, mine] = await Promise.all([
        supabase.rpc("published_leg_catalog", {
          p_since: homeWeekStart(new Date()),
        }),
        supabase
          .from("member_parlays")
          .select("id,title,legs,created_at,expires_at")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      if (!live || n !== epoch.current) return;
      if (catalog.error || mine.error)
        setError("Your leg library could not load. Sign in and try again.");
      else {
        setRows(weeklyLegs(catalog.data || []));
        setSaved(mine.data || []);
      }
      setLoading(false);
    }
    void load();
    // Refresh the library without discarding a member's in-progress combination.
    const refreshCatalog = async () => {
      if (document.visibilityState !== "visible") return;
      const n = epoch.current;
      const result = await supabase.rpc("published_leg_catalog", {
        p_since: homeWeekStart(new Date()),
      });
      if (!live || n !== epoch.current) return;
      if (result.error)
        setError(
          "The leg library could not refresh. Showing the last loaded observations; saving rechecks every leg.",
        );
      else setRows(weeklyLegs(result.data || []));
    };
    const refreshTimer = setInterval(() => void refreshCatalog(), 60000);
    window.addEventListener("focus", refreshCatalog);
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "INITIAL_SESSION" && event !== "TOKEN_REFRESHED")
        void load();
    });
    return () => {
      live = false;
      ++epoch.current;
      data.subscription.unsubscribe();
      clearInterval(refreshTimer);
      window.removeEventListener("focus", refreshCatalog);
    };
  }, []);
  function start() {
    setOpen(true);
    setTimeout(
      () =>
        builder.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      0,
    );
  }
  function toggle(leg: PublishedLeg) {
    setError("");
    setNotice("");
    if (chosen.some((r) => r.leg_key === leg.leg_key)) {
      setChosen(chosen.filter((r) => r.leg_key !== leg.leg_key));
      return;
    }
    const problem = selectionError(chosen, leg);
    if (problem) {
      setError(problem);
      return;
    }
    setChosen([...chosen, leg]);
    setOpen(true);
  }
  async function save() {
    if (busy || chosen.length < 2) return;
    setBusy(true);
    setError("");
    setNotice("");
    const n = epoch.current;
    try {
      const result = await supabase.rpc("create_member_parlay", {
        p_title: title.trim(),
        p_leg_keys: chosen.map((r) => r.leg_key),
      });
      if (n !== epoch.current) return;
      if (result.error) {
        setError(
          result.error.message ||
            "Could not save. Check that every leg is still open.",
        );
        return;
      }
      const readback = await supabase
        .from("member_parlays")
        .select("id,title,legs,created_at,expires_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (n !== epoch.current) return;
      if (readback.error || !readback.data?.some((r) => r.id === result.data)) {
        setError(
          "Save received, but confirmation could not load. Refresh before trying again.",
        );
        return;
      }
      setSaved(readback.data);
      setNotice("Saved to Your parlays.");
      setChosen([]);
      setOpen(false);
    } catch {
      if (n === epoch.current) setError("Could not save. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  const legs = rows.filter((r) =>
    `${r.name} ${r.market} ${r.matchup}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const showCatalog = mode === "catalog" || open;
  return (
    <section
      className="parlay-workshop"
      aria-label="Published legs and parlay builder"
    >
      <div className="workshop-head">
        <div>
          <h2>
            {mode === "catalog"
              ? "This week’s published legs"
              : "Make it your parlay"}
          </h2>
          <p>
            {mode === "catalog"
              ? "Every published player leg, including legs from our tickets. Newest observations first."
              : "Pick your own combination from the weekly leg library."}
          </p>
        </div>
        <button className="btn" onClick={start}>
          + Create parlay
        </button>
      </div>
      <p className="workshop-note">
        Published research is not automatically recommended. Only a current,
        approved model edge of 3 percentage points or more earns the sticker.
      </p>
      {loading && <p role="status">Loading your leg library…</p>}
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {open && (
        <section
          className="workshop-draft"
          ref={builder}
          aria-label="Your parlay draft"
        >
          <div className="workshop-head">
            <h3>Your parlay · {chosen.length}/4</h3>
            <button className="secondary" onClick={() => setOpen(false)}>
              Close builder
            </button>
          </div>
          <p>
            Choose 2–4 legs. Your combination, not a platform recommendation.
            Combined odds are unknown; same-game legs can be correlated.
          </p>
          <label>
            Parlay name
            <input
              maxLength={80}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <ul>
            {chosen.map((r) => (
              <li key={r.leg_key}>
                <span>{parlayCopyLine(r)}</span>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => toggle(r)}
                  aria-label={`Remove ${parlayCopyLine(r)}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          {!chosen.length && <p>Select legs below to get started.</p>}
          <button
            className="btn"
            disabled={busy || chosen.length < 2 || !title.trim()}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save my parlay"}
          </button>
        </section>
      )}
      {showCatalog && !loading && (
        <>
          <label className="workshop-search">
            Find a player, market or game
            <input
              type="search"
              placeholder="Search published legs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="workshop-legs">
            {legs.map((r) => {
              const selected = chosen.some((c) => c.leg_key === r.leg_key);
              const available = canBuildWith(r, now);
              const quoteAge = now - Date.parse(r.quote_observed_at || "");
              const recommended = Boolean(
                r.recommendation &&
                  available &&
                  quoteAge >= 0 &&
                  quoteAge <= 15 * 60 * 1000,
              );
              const result = r.result?.toUpperCase();
              const card: CasinoCardData = {
                variant: result === "WIN" ? "win" : result ? "miss" : "pick",
                eyebrow: result ? "Published leg · settled result" : "Published research · individual leg",
                title: r.name,
                market: cleanMarket(r.market),
                matchup: r.matchup,
                price: r.quote || "Odds unknown · analyst target",
                stamp: result === "WIN" ? "✓ HIT" : result === "LOSS" ? "MISS" : result || undefined,
                footnote: result
                  ? "Original published selection and recorded result. See case, risk & sources for the publication."
                  : "Published research is not automatically a recommendation. Review the case, risks and original quote.",
                publishedAt: r.published_at,
              };
              return (
                <div className="workshop-leg workshop-card" key={r.leg_key}>
                  <CasinoCard data={card} />
                  <div className="workshop-head">
                    {recommended ? (
                      <span className="workshop-recommended">
                        Recommended · 3%+ edge
                      </span>
                    ) : (
                      <span className="workshop-label">Published research</span>
                    )}
                  </div>
                  <p className="workshop-note">
                    {r.quote || "Odds unknown · analyst target"}
                    {r.quote_observed_at
                      ? ` · Observed ${new Date(r.quote_observed_at).toLocaleString()}`
                      : " · Quote time unknown"}
                  </p>
                  <details>
                    <summary>Case, risk & sources</summary>
                    <p>{r.why || "See the original research card."}</p>
                    <p>
                      <strong>Why it could lose:</strong>{" "}
                      {r.risk || "Workload and availability remain uncertain."}
                    </p>
                    <p>
                      Published {new Date(r.published_at).toLocaleString()}.
                      Original price is historical, not a live quote.
                    </p>
                    {r.recommendation && (
                      <a
                        href={r.recommendation.validation_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Model validation ·{" "}
                        {r.recommendation.model_id.slice(0, 12)}
                      </a>
                    )}
                    <Link
                      href={
                        r.leg_key.startsWith("candidate:")
                          ? `/feed#release-${r.leg_key.split(":")[1]}`
                          : "/records"
                      }
                    >
                      Original publication →
                    </Link>
                  </details>
                  <div className="workshop-actions">
                    <CasinoCardDownload data={card} />
                    <button
                      className={selected ? "btn" : "secondary"}
                      disabled={busy || (!available && !selected)}
                      aria-pressed={selected}
                      onClick={() => toggle(r)}
                    >
                      {selected
                        ? "✓ Added · remove"
                        : available
                          ? "+ Add to parlay"
                          : r.result || "Closed for new parlays"}
                    </button>
                    {available && parlayCopyLine(r) && (
                      <GamblyLink
                        url="https://gambly.com"
                        selection={parlayCopyLine(r)!}
                        label="Copy leg ↗"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {!legs.length && (
            <p>
              No published legs match yet. Research updates remain in Latest; we
              publish selections only when their checks pass.
            </p>
          )}
        </>
      )}
      {mode === "parlays" && (
        <section className="workshop-saved">
          <h2>Your parlays</h2>
          <p className="workshop-note">
            Private saved combinations. Saving does not place a wager or add to
            your tail record.
          </p>
          {!saved.length && !loading && (
            <p>Your saved parlays will appear here.</p>
          )}
          {saved.map((p) => (
            <details key={p.id} className="workshop-leg">
              <summary>
                <strong>{p.title}</strong> · {p.legs.length} legs
                {Date.parse(p.expires_at) <= Date.now() ? " · Closed" : ""}
              </summary>
              <ul>
                {p.legs.map((r) => (
                  <li key={r.leg_key}>{parlayCopyLine(r)}</li>
                ))}
              </ul>
              <p>
                Combined odds unknown. Every leg must hit. Your selection is not
                a Vegas Quant recommendation.
              </p>
              {Date.parse(p.expires_at) > Date.now() && (
                <GamblyLink
                  url="https://gambly.com"
                  selection={parlayCopy(p.legs)}
                  label="Copy parlay & open Gambly ↗"
                />
              )}
            </details>
          ))}
        </section>
      )}
    </section>
  );
}
