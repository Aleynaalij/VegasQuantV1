"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { homeWeekStart } from "@/lib/home-week";
import {
  canBuildWith,
  reusableSelections,
  parlayCopy,
  parlayCopyLine,
  selectionError,
  weeklyLegs,
  filterPublishedLegs,
  vqApprovedLeg,
  type LegStatFilter,
  type MemberParlay,
  type PublishedLeg,
} from "@/lib/parlay-builder";
import GamblyLink from "./gambly-link";
import CasinoCard, { CasinoCardDownload } from "./casino-card";
import { cleanMarket, type CasinoCardData } from "@/lib/casino-card";
import { useLegForms, VqStamp } from "./leg-form";

export default function ParlayWorkshop({
  mode,
}: {
  mode: "catalog" | "parlays";
}) {
  const router = useRouter();
  const routeSaved = useSearchParams().get("saved") || "";
  const [savedId, setSavedId] = useState("");
  const [savedPrompt, setSavedPrompt] = useState<MemberParlay | null>(null);
  const owner = useRef("");
  const [promptVersion, setPromptVersion] = useState(0);
  const [reusedSave, setReusedSave] = useState(false);
  const [shareChecked, setShareChecked] = useState(false);
  const saveDialog = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<PublishedLeg[]>([]);
  const [saved, setSaved] = useState<MemberParlay[]>([]);
  const [chosen, setChosen] = useState<PublishedLeg[]>([]);
  const [open, setOpen] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);
  const [sharedPost, setSharedPost] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statFilter, setStatFilter] = useState<LegStatFilter>("all");
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const [title, setTitle] = useState("My parlay");
  const epoch = useRef(0);
  const builder = useRef<HTMLElement>(null);
  const focusedRoute = useRef("");
  useEffect(() => {
    let live = true;
    async function load() {
      const n = ++epoch.current;
      setLoading(true);
      setDraftReady(false);
      setTitle("My parlay");
      setOpen(false);
      setChosen([]);
      setSaved([]);
      setSavedId("");
      focusedRoute.current = "";
      setSavedPrompt(null);
      setPromptVersion(0);
      saveDialog.current?.close();
      setSharing(null);
      setSharedPost(null);
      setNotice("");
      setRows([]);
      setError("");
      owner.current = "";
      const [catalog, mine, session] = await Promise.all([
        supabase.rpc("published_leg_catalog", {
          p_since: homeWeekStart(new Date()),
        }),
        supabase
          .from("member_parlays")
          .select("id,title,legs,created_at,expires_at,community_post_id")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(50),
        supabase.auth.getSession(),
      ]);
      if (!live || n !== epoch.current) return;
      if (catalog.error || mine.error)
        setError("Your leg library could not load. Sign in and try again.");
      else {
        setRows(weeklyLegs(catalog.data || []));
        owner.current = session.data.session?.user.id || "";
        let recent = routeSaved;
        try {
          recent ||= owner.current
            ? sessionStorage.getItem(`vq-parlay-recent:${owner.current}`) || ""
            : "";
        } catch {
          /* Storage can be disabled; the saved-card URL still works. */
        }
        const list = [...(mine.data || [])].sort(
          (a, b) =>
            Date.parse(b.created_at) - Date.parse(a.created_at) ||
            b.id.localeCompare(a.id),
        );
        if (recent && !list.some((p) => p.id === recent)) {
          const extra = await supabase
            .from("member_parlays")
            .select("id,title,legs,created_at,expires_at,community_post_id")
            .eq("id", recent)
            .maybeSingle();
          if (!live || n !== epoch.current) return;
          if (extra.data) list.push(extra.data);
        }
        const pinned = list.find((p) => p.id === recent);
        setSaved(
          pinned ? [pinned, ...list.filter((p) => p.id !== recent)] : list,
        );
        if (pinned) setSavedId(pinned.id);
        try {
          const raw =
            owner.current &&
            sessionStorage.getItem(`vq-parlay-draft:${owner.current}`);
          const draft = raw ? JSON.parse(raw) : null;
          if (
            draft &&
            Array.isArray(draft.keys) &&
            draft.keys.every((k: unknown) => typeof k === "string")
          ) {
            const restored = reusableSelections(
              draft.keys,
              weeklyLegs(catalog.data || []),
            );
            setChosen(restored.legs);
            setTitle(
              typeof draft.title === "string"
                ? draft.title.slice(0, 80)
                : "My parlay",
            );
            setOpen(restored.legs.length > 0);
            if (restored.skipped)
              setNotice(
                `${restored.skipped} closed or unavailable selections were left out of your recovered draft. Saved cards are unchanged.`,
              );
          }
        } catch {
          /* Browser recovery is optional; saved cards live in your account. */
        }
        setDraftReady(true);
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
  useEffect(() => {
    if (!draftReady || !owner.current) return;
    try {
      const key = `vq-parlay-draft:${owner.current}`;
      if (chosen.length)
        sessionStorage.setItem(
          key,
          JSON.stringify({ title, keys: chosen.map((leg) => leg.leg_key) }),
        );
      else sessionStorage.removeItem(key);
    } catch {
      /* Account saves still work when browser storage is disabled. */
    }
  }, [chosen, title, draftReady]);
  function reuse(parlay: MemberParlay) {
    const restored = reusableSelections(
      parlay.legs.map((leg) => leg.leg_key),
      rows,
    );
    setChosen(restored.legs);
    setTitle(`${parlay.title} · copy`.slice(0, 80));
    setError("");
    setSearch("");
    setStatFilter("all");
    setApprovedOnly(false);
    setNotice(
      restored.skipped
        ? `${restored.skipped} closed or unavailable selections were left out. Your original saved card is unchanged.`
        : "Editing a copy. Your original saved card is unchanged.",
    );
    start();
  }
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
      const [readback, confirmation] = await Promise.all([
        supabase
          .from("member_parlays")
          .select("id,title,legs,created_at,expires_at,community_post_id")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(50),
        supabase
          .from("member_parlays")
          .select("id,title,legs,created_at,expires_at,community_post_id")
          .eq("id", result.data)
          .single(),
      ]);
      if (n !== epoch.current) return;
      if (confirmation.error || !confirmation.data) {
        setError(
          "Save received, but confirmation could not load. Refresh before trying again.",
        );
        return;
      }
      const confirmed = confirmation.data;
      setReusedSave(
        saved.some((p) => p.id === confirmed.id) ||
          confirmed.title !== title.trim(),
      );
      setSaved([
        confirmed,
        ...(readback.data || saved).filter((p) => p.id !== confirmed.id),
      ]);
      try {
        if (owner.current)
          sessionStorage.setItem(
            `vq-parlay-recent:${owner.current}`,
            confirmed.id,
          );
      } catch {
        /* The direct saved-card route remains available. */
      }
      setSavedId(confirmed.id);
      setSavedPrompt(confirmed);
      setPromptVersion((v) => v + 1);
      setShareChecked(false);
      setNotice(`Saved “${confirmed.title}” to My parlays.`);
      setChosen([]);
      setOpen(false);
      router.replace(
        `/community?build=1&saved=${encodeURIComponent(confirmed.id)}#my-parlay-${confirmed.id}`,
        { scroll: false },
      );
    } catch {
      if (n === epoch.current) setError("Could not save. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  async function share(parlay: MemberParlay) {
    if (sharing) return false;
    const n = epoch.current;
    setSharing(parlay.id);
    setError("");
    setNotice("");
    setSharedPost(null);
    try {
      const result = await supabase.rpc("share_member_parlay", {
        p_parlay: parlay.id,
      });
      if (n !== epoch.current) return false;
      if (result.error || !result.data)
        throw Error(
          result.error?.message || "Could not share your parlay. Please retry.",
        );
      setSaved((current) =>
        current.map((p) =>
          p.id === parlay.id ? { ...p, community_post_id: result.data } : p,
        ),
      );
      setSavedPrompt((current) =>
        current?.id === parlay.id
          ? { ...current, community_post_id: result.data }
          : current,
      );
      setSharedPost(result.data);
      setNotice("Your Vegas Quant parlay card is posted to Community.");
      window.dispatchEvent(new Event("vq-community-changed"));
      return true;
    } catch (error) {
      if (n === epoch.current)
        setError(
          error instanceof Error
            ? error.message
            : "Could not share. Please retry.",
        );
      return false;
    } finally {
      if (n === epoch.current) setSharing(null);
    }
  }
  useEffect(() => {
    if (promptVersion && !saveDialog.current?.open)
      saveDialog.current?.showModal();
  }, [promptVersion]);
  useEffect(() => {
    if (
      mode !== "parlays" ||
      !routeSaved ||
      focusedRoute.current === routeSaved ||
      !saved.some((p) => p.id === routeSaved)
    )
      return;
    focusedRoute.current = routeSaved;
    const card = document.getElementById(`my-parlay-${routeSaved}`);
    card?.scrollIntoView({ block: "center" });
    card?.focus({ preventScroll: true });
  }, [mode, routeSaved, saved]);
  async function continueAfterSave() {
    if (!savedPrompt) return false;
    if (
      shareChecked &&
      !savedPrompt.community_post_id &&
      !(await share(savedPrompt))
    )
      return false;
    saveDialog.current?.close();
    return true;
  }
  async function openSavedDestination() {
    if (!savedPrompt || Date.parse(savedPrompt.expires_at) <= Date.now()) {
      setError("This parlay has closed. You can still view it in My parlays.");
      return false;
    }
    if (!(await continueAfterSave())) return false;
    document
      .getElementById(`my-parlay-${savedPrompt.id}`)
      ?.scrollIntoView({ block: "center" });
    return true;
  }
  async function viewSaved() {
    const id = savedPrompt?.id;
    if (!id || !(await continueAfterSave())) return;
    if (mode === "catalog")
      router.push(
        `/community?build=1&saved=${encodeURIComponent(id)}#my-parlay-${id}`,
      );
    else {
      const card = document.getElementById(`my-parlay-${id}`);
      card?.scrollIntoView({ block: "center" });
      card?.focus({ preventScroll: true });
    }
  }
  const showCatalog = mode === "catalog" || open;
  // Recent form and tracked prices, for the stamp of approval on recommended legs.
  const legForms = useLegForms(showCatalog ? rows.map((r) => r.leg_key) : []);
  const approvedKeys = new Set(
    rows
      .filter((r) =>
        vqApprovedLeg(
          r,
          legForms.forms[r.leg_key],
          legForms.prices[r.leg_key]?.last,
        ),
      )
      .map((r) => r.leg_key),
  );
  const legs = filterPublishedLegs(
    rows,
    statFilter,
    search,
    approvedOnly,
    approvedKeys,
  );
  return (
    <section
      className={`parlay-workshop${open ? " workshop-building" : ""}`}
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
        Published research is not automatically recommended. “Recommended · 3%+
        edge” needs a current, approved model edge. The ✓ VQ APPROVED stamp
        means the leg passes every selection rule and its recent form beats the
        price’s break-even by 15+ points; it is not a model edge or a guarantee.
      </p>
      {loading && <p role="status">Loading your leg library…</p>}
      {error && !open && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {sharedPost && (
        <Link href={`/community?post=${sharedPost}`}>
          View your community post →
        </Link>
      )}
      {open && (
        <section
          className="workshop-draft"
          ref={builder}
          aria-label="Your parlay draft"
        >
          <div className="workshop-head">
            <h3>Your parlay · {chosen.length} legs</h3>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Close builder
            </button>
          </div>
          <p>
            Choose two or more legs. No leg limit. Your combination, not a
            platform recommendation. Combined odds are unknown; same-game legs
            can be correlated.
          </p>
          <label>
            Parlay name
            <input
              maxLength={80}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <button
            className="secondary"
            disabled={busy || !chosen.length}
            onClick={() => {
              setChosen([]);
              setError("");
              setNotice("Draft selections cleared. Saved cards are unchanged.");
            }}
          >
            Clear selections
          </button>
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
        </section>
      )}
      {open && (
        <aside className="workshop-save-tray" aria-label="Save your parlay">
          <div>
            <strong>{chosen.length} legs selected</strong>
            <small>{title.trim() || "Name your parlay above"}</small>
          </div>
          <button
            className="secondary"
            onClick={() => builder.current?.scrollIntoView({ block: "start" })}
          >
            Review
          </button>
          <button
            className="btn"
            disabled={busy || chosen.length < 2 || !title.trim()}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save my parlay"}
          </button>
          {error && <p role="alert">{error}</p>}
        </aside>
      )}
      <dialog
        ref={saveDialog}
        className="entry-dialog workshop-save-dialog"
        aria-labelledby="parlay-saved-title"
      >
        <h2 id="parlay-saved-title">Parlay saved</h2>
        {savedPrompt && (
          <>
            {reusedSave && (
              <p>
                This combination was already saved. Its saved name and card are
                kept below.
              </p>
            )}
            <p>
              <strong>{savedPrompt.title}</strong> · {savedPrompt.legs.length}{" "}
              legs. It’s first in My parlays.
            </p>
            {savedPrompt.community_post_id ? (
              <p role="status">Your Vegas Quant card is posted to Community.</p>
            ) : (
              <label className="workshop-share-check">
                <input
                  type="checkbox"
                  checked={shareChecked}
                  disabled={sharing !== null}
                  onChange={(e) => setShareChecked(e.target.checked)}
                />
                Share to Community when I continue
              </label>
            )}
            <p className="workshop-note">
              Community posts use your Vegas Quant parlay card.
            </p>
            {error && <p role="alert">{error}</p>}
            <div className="workshop-actions">
              <GamblyLink
                url="https://gambly.com/"
                selection={parlayCopy(savedPrompt.legs)}
                kalshiLegKeys={savedPrompt.legs.map((leg) => leg.leg_key)}
                label="Open with Gambly ↗"
                portalDialog
                beforeOpen={openSavedDestination}
                disabled={sharing !== null}
              />
              <button
                className="btn"
                disabled={sharing !== null}
                onClick={() => void viewSaved()}
              >
                {sharing ? "Posting…" : "View My parlays"}
              </button>
              <button
                className="secondary"
                disabled={sharing !== null}
                onClick={() => void continueAfterSave()}
              >
                Done
              </button>
            </div>
          </>
        )}
      </dialog>
      {(mode === "parlays" || savedId) && (
        <section className="workshop-saved" id="my-parlays">
          <h2>My parlays</h2>
          <p className="workshop-note">Most recently saved first.</p>
          <p className="workshop-note">
            Private saved combinations. Saving does not place a wager or add to
            your tail record.
          </p>
          {!saved.length && !loading && (
            <p>Your saved parlays will appear here.</p>
          )}
          {(mode === "parlays"
            ? saved
            : saved.filter((p) => p.id === savedId)
          ).map((p) => (
            <details
              key={p.id}
              id={`my-parlay-${p.id}`}
              tabIndex={-1}
              open={p.id === savedId ? true : undefined}
              className={`workshop-leg${p.id === savedId ? " workshop-just-saved" : ""}`}
            >
              <summary>
                {p.id === savedId && (
                  <span className="workshop-new">Just saved</span>
                )}
                <strong>{p.title}</strong> · {p.legs.length} legs
                {Date.parse(p.expires_at) <= Date.now() ? " · Closed" : ""}
              </summary>
              <CasinoCard
                data={{
                  variant: "parlay",
                  eyebrow: "Your saved parlay",
                  title: p.title,
                  market: `${p.legs.length} selections`,
                  legs: p.legs.map((leg) => ({
                    name: leg.name,
                    market: cleanMarket(leg.market),
                  })),
                  publishedAt: p.created_at,
                  footnote:
                    "Your saved selections. Not a wager confirmation. Combined odds unknown.",
                }}
              />
              <button
                className="btn"
                disabled={busy || loading}
                onClick={() => reuse(p)}
              >
                Reuse / edit a copy
              </button>
              <p className="workshop-note">
                Remove legs, clear selections or add more below. Saving a
                changed combination keeps this original.
              </p>
              <ul>
                {p.legs.map((r) => (
                  <li key={r.leg_key}>{parlayCopyLine(r)}</li>
                ))}
              </ul>
              <p>
                Combined odds unknown. Every leg must hit. Your selection is not
                a Vegas Quant recommendation.
              </p>
              {p.community_post_id ? (
                <Link href={`/community?post=${p.community_post_id}`}>
                  View community card →
                </Link>
              ) : (
                <button
                  type="button"
                  className="primary"
                  disabled={sharing !== null}
                  onClick={() => void share(p)}
                >
                  {sharing === p.id ? "Posting…" : "Post to Community"}
                </button>
              )}
              {Date.parse(p.expires_at) > Date.now() && (
                <GamblyLink
                  url="https://gambly.com"
                  selection={parlayCopy(p.legs)}
                  kalshiLegKeys={p.legs.map((r) => r.leg_key)}
                  label="Copy parlay & open Gambly ↗"
                />
              )}
            </details>
          ))}
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
          <div
            className="workshop-filters"
            role="group"
            aria-label="Filter published legs"
          >
            {(
              [
                ["all", "All legs"],
                ["receiving", "Receiving"],
                ["passing", "Passing"],
                ["rushing", "Rushing"],
                ["receptions", "Receptions"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={statFilter === value ? "btn" : "secondary"}
                aria-pressed={statFilter === value}
                onClick={() => setStatFilter(value)}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              className={
                approvedOnly
                  ? "btn workshop-approved-filter"
                  : "secondary workshop-approved-filter"
              }
              aria-pressed={approvedOnly}
              onClick={() => setApprovedOnly(!approvedOnly)}
            >
              ✓ VQ Approved
            </button>
          </div>
          <p className="workshop-note" role="status">
            Showing {legs.length} of {rows.length} legs
            {approvedOnly ? " · VQ Approved only" : ""}
          </p>
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
              const approved = approvedKeys.has(r.leg_key);
              const card: CasinoCardData = {
                variant: result === "WIN" ? "win" : result ? "miss" : "pick",
                eyebrow: result
                  ? "Published leg · settled result"
                  : "Published research · individual leg",
                title: r.name,
                market: cleanMarket(r.market),
                matchup: r.matchup,
                price: r.quote || "Odds unknown · analyst target",
                stamp:
                  result === "WIN"
                    ? "✓ HIT"
                    : result === "LOSS"
                      ? "MISS"
                      : result || undefined,
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
                    {approved && <VqStamp />}
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
                        kalshiLegKeys={[r.leg_key]}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {!legs.length && (
            <p>
              No legs match these filters. Try another stat type or turn off VQ
              Approved.
            </p>
          )}
        </>
      )}
    </section>
  );
}
