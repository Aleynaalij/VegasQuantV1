"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  resolveWorkshopAccess,
  type WorkshopAccess,
} from "@/lib/parlay-workshop-access";
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

/** A dropped connection surfaces as a raw fetch error; members get a plain retry message instead. */
const NETWORK_ERROR = /Failed to fetch|NetworkError|Load failed|fetch failed/i;
function plain(message: string | undefined, fallback: string) {
  if (!message) return fallback;
  return NETWORK_ERROR.test(message)
    ? "Connection dropped before this finished. Check your connection and retry."
    : message;
}
export default function ParlayWorkshop({
  mode,
}: {
  mode: "catalog" | "parlays";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [hashSaved, setHashSaved] = useState("");
  useEffect(() => {
    const update = () =>
      setHashSaved(
        /^#my-parlay-([a-f0-9-]{36})$/i.exec(window.location.hash)?.[1] || "",
      );
    update();
    window.addEventListener("hashchange", update);
    window.addEventListener("popstate", update);
    return () => {
      window.removeEventListener("hashchange", update);
      window.removeEventListener("popstate", update);
    };
  }, []);
  const routeSaved = params.get("saved") || hashSaved;
  const routeBuild = params.get("build") === "1";
  const requestedSaved = useRef(routeSaved);
  requestedSaved.current = routeSaved;
  const buildRequested = useRef(routeBuild);
  buildRequested.current = routeBuild;
  const retryLoad = useRef<() => void>(() => {});
  const accessReady = useRef(false);
  const [accessState, setAccessState] = useState<WorkshopAccess>("checking");
  const [savedId, setSavedId] = useState("");
  const [savedPrompt, setSavedPrompt] = useState<MemberParlay | null>(null);
  const owner = useRef("");
  const [promptVersion, setPromptVersion] = useState(0);
  const [reusedSave, setReusedSave] = useState(false);
  const [shareChecked, setShareChecked] = useState(false);
  const saveDialog = useRef<HTMLDialogElement>(null);
  const buildButton = useRef<HTMLButtonElement>(null);
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
  const [title, setTitle] = useState("My lay");
  const epoch = useRef(0);
  const builder = useRef<HTMLElement>(null);
  const focusedRoute = useRef("");
  useEffect(() => {
    let live = true;
    async function load() {
      const n = ++epoch.current;
      setLoading(true);
      setDraftReady(false);
      setTitle("My lay");
      setOpen(false);
      setChosen([]);
      setSaved([]);
      setSavedId("");
      focusedRoute.current = "";
      setSavedPrompt(null);
      setBusy(false);
      setPromptVersion(0);
      saveDialog.current?.close();
      setSharing(null);
      setSharedPost(null);
      setNotice("");
      setRows([]);
      setError("");
      accessReady.current = false;
      setAccessState("checking");
      try {
        const access = await resolveWorkshopAccess(
          () => supabase.auth.getSession(),
          () =>
            supabase
              .rpc("membership_status")
              .abortSignal(AbortSignal.timeout(20000)),
        );
        if (!live || n !== epoch.current) return;
        owner.current = access.owner;
        setAccessState(access.state);
        if (access.state !== "ready" && access.state !== "denied") {
          if (access.state === "failed") setError(access.message);
          setLoading(false);
          return;
        }
        const signal = AbortSignal.timeout(20000);
        const [catalog, mine] = await Promise.all([
          access.state === "ready"
            ? supabase
                .rpc("published_leg_catalog", {
                  p_since: homeWeekStart(new Date()),
                })
                .abortSignal(signal)
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from("member_parlays")
            .select("id,title,legs,created_at,expires_at,community_post_id")
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(50)
            .abortSignal(signal),
        ]);
        if (!live || n !== epoch.current) return;
        if (catalog.error || mine.error) {
          setAccessState("failed");
          setError(
            "Your leg library or saved lays could not load. Please retry.",
          );
        } else {
          setRows(weeklyLegs(catalog.data || []));
          let recent = requestedSaved.current;
          try {
            recent ||= owner.current
              ? sessionStorage.getItem(`vq-parlay-recent:${owner.current}`) ||
                ""
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
              .abortSignal(signal)
              .maybeSingle();
            if (!live || n !== epoch.current) return;
            if (extra.error)
              setNotice(
                "The requested saved lay could not load. Retry to check it again.",
              );
            else if (extra.data) list.push(extra.data);
            else if (requestedSaved.current)
              setNotice(
                "This saved lay is missing or unavailable to this account.",
              );
          }
          const pinned = list.find((p) => p.id === recent);
          setSaved(
            pinned ? [pinned, ...list.filter((p) => p.id !== recent)] : list,
          );
          if (pinned) setSavedId(pinned.id);
          try {
            const raw =
              access.state === "ready" &&
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
                  : "My lay",
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
          if (buildRequested.current && access.state === "ready") setOpen(true);
          accessReady.current = access.state === "ready";
          setDraftReady(access.state === "ready");
        }
        setLoading(false);
      } catch {
        if (!live || n !== epoch.current) return;
        setAccessState("failed");
        setError(
          "Your leg library could not load. Check your connection and retry.",
        );
        setLoading(false);
      }
    }
    retryLoad.current = () => {
      void load();
    };
    void load();
    // Refresh the library without discarding a member's in-progress combination.
    const refreshCatalog = async () => {
      if (document.visibilityState !== "visible" || !accessReady.current)
        return;
      const n = epoch.current;
      try {
        const access = await supabase
          .rpc("membership_status")
          .abortSignal(AbortSignal.timeout(20000));
        if (!live || n !== epoch.current) return;
        if (access.error || typeof access.data?.allowed !== "boolean")
          throw Error("Access check failed");
        if (!access.data.allowed) {
          void load();
          return;
        }
        const result = await supabase
          .rpc("published_leg_catalog", {
            p_since: homeWeekStart(new Date()),
          })
          .abortSignal(AbortSignal.timeout(20000));
        if (!live || n !== epoch.current) return;
        if (result.error)
          setError(
            "The leg library could not refresh. Showing the last loaded observations; saving rechecks every leg.",
          );
        else {
          setRows(weeklyLegs(result.data || []));
          setError("");
        }
      } catch {
        if (live && n === epoch.current)
          setError(
            "The leg library could not refresh. Showing the last loaded observations; saving rechecks every leg.",
          );
      }
    };
    const refreshTimer = setInterval(() => void refreshCatalog(), 60000);
    window.addEventListener("focus", refreshCatalog);
    // Supabase repeats SIGNED_IN when a tab regains focus or another tab signs in. Reload (which
    // clears the draft and closes the save dialog) only when the account actually changes.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      const nextOwner = session?.user.id || "";
      if (nextOwner === owner.current) return;
      // Invalidate pending reads/writes immediately; defer auth calls outside the auth lock.
      ++epoch.current;
      owner.current = nextOwner;
      accessReady.current = false;
      setDraftReady(false);
      setRows([]);
      setSaved([]);
      setChosen([]);
      setSavedPrompt(null);
      setOpen(false);
      setNotice("");
      setError("");
      setBusy(false);
      setSharing(null);
      setSharedPost(null);
      saveDialog.current?.close();
      setLoading(true);
      setAccessState("checking");
      setTimeout(() => {
        if (live) void load();
      }, 0);
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
    if (!accessReady.current) return;
    setOpen(true);
    setTimeout(
      () =>
        builder.current?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
          block: "start",
        }),
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
    if (busy || !accessReady.current || chosen.length < 2) return;
    setBusy(true);
    setError("");
    setNotice("");
    const n = epoch.current;
    try {
      const result = await supabase
        .rpc("create_member_parlay", {
          p_title: title.trim(),
          p_leg_keys: chosen.map((r) => r.leg_key),
        })
        .abortSignal(AbortSignal.timeout(20000));
      if (n !== epoch.current) return;
      if (result.error) {
        setError(
          plain(
            result.error.message,
            "Could not save. Check that every leg is still open.",
          ),
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
      setNotice(`Saved “${confirmed.title}” to My lays.`);
      setChosen([]);
      setOpen(false);
      // Stay on this page: replacing to another route would unmount the workshop and its
      // "Lay saved" prompt.
      const here =
        pathname === "/parlays"
          ? "/parlays?"
          : pathname === "/community"
            ? "/community?build=1&"
            : `/feed?view=${mode === "catalog" ? "legs" : "parlays"}&`;
      router.replace(
        `${here}saved=${encodeURIComponent(confirmed.id)}#my-parlay-${confirmed.id}`,
        { scroll: false },
      );
    } catch {
      if (n === epoch.current)
        setError(
          "Save could not be confirmed. Check My lays before retrying; retrying the same combination keeps one saved card.",
        );
    } finally {
      if (n === epoch.current) setBusy(false);
    }
  }
  async function share(parlay: MemberParlay) {
    if (sharing || !accessReady.current) return false;
    const n = epoch.current;
    setSharing(parlay.id);
    setError("");
    setNotice("");
    setSharedPost(null);
    try {
      const result = await supabase
        .rpc("share_member_parlay", {
          p_parlay: parlay.id,
        })
        .abortSignal(AbortSignal.timeout(20000));
      if (n !== epoch.current) return false;
      if (result.error || !result.data)
        throw Error(
          plain(
            result.error?.message,
            "Could not share your lay. Please retry.",
          ),
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
      setNotice("Your Vegas Quant lay card is posted to Community.");
      window.dispatchEvent(new Event("vq-community-changed"));
      return true;
    } catch (error) {
      if (n === epoch.current)
        setError(
          plain(
            error instanceof Error ? error.message : undefined,
            "Could not share. Please retry.",
          ),
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
    if (routeBuild && accessState === "ready" && !loading) setOpen(true);
  }, [routeBuild, accessState, loading]);
  useEffect(() => {
    if (
      !routeSaved ||
      (!accessReady.current && accessState !== "denied") ||
      loading
    )
      return;
    let active = true;
    const n = epoch.current;
    setSavedId(routeSaved);
    if (saved.some((p) => p.id === routeSaved)) return;
    void (async () => {
      try {
        const result = await supabase
          .from("member_parlays")
          .select("id,title,legs,created_at,expires_at,community_post_id")
          .eq("id", routeSaved)
          .abortSignal(AbortSignal.timeout(20000))
          .maybeSingle();
        if (!active || n !== epoch.current) return;
        if (result.error)
          setNotice(
            "The requested saved lay could not load. Retry to check it again.",
          );
        else if (!result.data)
          setNotice(
            "This saved lay is missing or unavailable to this account.",
          );
        else
          setSaved((current) => [
            result.data!,
            ...current.filter((p) => p.id !== routeSaved),
          ]);
      } catch {
        if (active && n === epoch.current)
          setNotice(
            "The requested saved lay could not load. Retry to check it again.",
          );
      }
    })();
    return () => {
      active = false;
    };
  }, [routeSaved, loading, saved, accessState]);
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
    buildButton.current?.focus();
    return true;
  }
  async function openSavedDestination() {
    if (!savedPrompt || Date.parse(savedPrompt.expires_at) <= Date.now()) {
      setError("This lay has closed. You can still view it in My lays.");
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
      router.push(`/parlays?saved=${encodeURIComponent(id)}#my-parlay-${id}`);
    else {
      const card = document.getElementById(`my-parlay-${id}`);
      card?.scrollIntoView({ block: "center" });
      card?.focus({ preventScroll: true });
    }
  }
  const showCatalog = mode === "catalog" || open;
  // Historical form/price screen; independent of model qualification.
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
      <nav className="workshop-views" aria-label="Your lays">
        <Link
          href="/parlays"
          aria-current={pathname === "/parlays" ? "page" : undefined}
        >
          My lays
        </Link>
        <Link href="/parlays/tailed">Tailed</Link>
      </nav>
      <div className="workshop-head">
        <div>
          <h2>
            {mode === "catalog" ? "This week’s published legs" : "Build a lay"}
          </h2>
          <p>
            {mode === "catalog"
              ? "Every published player leg, including legs from our tickets. Newest observations first."
              : "Pick your own combination from the weekly leg library."}
          </p>
        </div>
        <button
          className="btn"
          ref={buildButton}
          onClick={start}
          disabled={accessState !== "ready" || loading}
        >
          Build a lay
        </button>
      </div>
      <p className="workshop-note">
        Published research is not automatically recommended. “Recommended · 3%+
        edge” needs a current, approved model edge. “Recent form” describes a
        historical form-and-price screen, not model approval, an official pick,
        or a forecast. Past results do not guarantee future outcomes. This
        library currently supports published NFL full-game player-stat legs.
      </p>
      {loading && <p role="status">Loading your leg library…</p>}
      {error && !open && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {accessState === "signed-out" && (
        <p>
          Sign in to build a lay and see your private saved lays. Saving keeps a
          combination in your account; sharing to The Zone is optional.{" "}
          <Link href="/membership">Sign in or check membership →</Link>
        </p>
      )}
      {accessState === "denied" && (
        <p>
          Your account does not currently have research access.{" "}
          <Link href="/membership">Check account access →</Link>
        </p>
      )}
      {error && !loading && (
        <button className="secondary" onClick={() => retryLoad.current()}>
          Retry library
        </button>
      )}
      {notice && <p role="status">{notice}</p>}
      {notice.includes("Retry to check") && !loading && (
        <button className="secondary" onClick={() => retryLoad.current()}>
          Retry saved lay
        </button>
      )}
      {sharedPost && (
        <Link href={`/community?post=${sharedPost}`}>
          View your community post →
        </Link>
      )}
      {open && (
        <section
          className="workshop-draft"
          ref={builder}
          aria-label="Your lay draft"
        >
          <div className="workshop-head">
            <h3>
              Your lay · {chosen.length} leg{chosen.length === 1 ? "" : "s"}
            </h3>
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
            Lay name
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
        <aside className="workshop-save-tray" aria-label="Save your lay">
          <div>
            <strong>
              {chosen.length} leg{chosen.length === 1 ? "" : "s"} selected
            </strong>
            <small>{title.trim() || "Name your lay above"}</small>
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
            {busy ? "Saving…" : "Save lay"}
          </button>
          {error && <p role="alert">{error}</p>}
        </aside>
      )}
      <dialog
        ref={saveDialog}
        className="entry-dialog workshop-save-dialog"
        onCancel={(event) => {
          event.preventDefault();
          if (sharing) return;
          saveDialog.current?.close();
          buildButton.current?.focus();
        }}
        aria-labelledby="parlay-saved-title"
      >
        <h2 id="parlay-saved-title">Lay saved</h2>
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
              legs. It’s first in My lays.
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
              Community posts use your Vegas Quant lay card.
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
                {sharing ? "Posting…" : "View My lays"}
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
      {(accessState === "ready" || accessState === "denied") &&
        !loading &&
        (mode === "parlays" || savedId) && (
          <section className="workshop-saved" id="my-parlays">
            <h2>My lays</h2>
            <p className="workshop-note">Most recently saved first.</p>
            <p className="workshop-note">
              Private saved combinations. Saving does not place a wager or add
              to your tail record.
            </p>
            {!saved.length && !loading && (
              <p>Your saved lays will appear here.</p>
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
                    eyebrow: "Your saved lay",
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
                  disabled={busy || loading || accessState !== "ready"}
                  onClick={() => reuse(p)}
                >
                  Edit a copy
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
                  Combined odds unknown. Every leg must hit. Your selection is
                  not a Vegas Quant recommendation.
                </p>
                {p.community_post_id ? (
                  <Link href={`/community?post=${p.community_post_id}`}>
                    View community card →
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="primary"
                    disabled={sharing !== null || accessState !== "ready"}
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
                    label="Copy lay & open Gambly ↗"
                  />
                )}
              </details>
            ))}
          </section>
        )}
      {showCatalog && !loading && accessState === "ready" && (
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
              aria-describedby="recent-form-explanation"
              aria-pressed={approvedOnly}
              onClick={() => setApprovedOnly(!approvedOnly)}
            >
              Recent form
            </button>
          </div>
          <p className="workshop-note" id="recent-form-explanation">
            Historical form-and-price screen only. This is not model approval or
            a predicted edge.
          </p>
          <p className="workshop-note" role="status">
            Showing {legs.length} of {rows.length} legs
            {approvedOnly ? " · Recent form only" : ""}
          </p>
          {!rows.length && (
            <p>
              No supported NFL player legs have been published for this week.
            </p>
          )}
          {!!rows.length && !legs.length && (
            <p>
              No legs match these filters. Try All legs or clear your search.
            </p>
          )}
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
                          ? // A bare /feed redirects to the Zone; the Latest view keeps every release.
                            `/feed?view=latest&release=${encodeURIComponent(r.leg_key.split(":")[1])}#release-${encodeURIComponent(r.leg_key.split(":")[1])}`
                          : r.game_id
                            ? `/matchups/game/${encodeURIComponent(r.game_id)}`
                            : "/matchups"
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
                          ? "+ Add to lay"
                          : r.result || "Closed for new lays"}
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
        </>
      )}
    </section>
  );
}
