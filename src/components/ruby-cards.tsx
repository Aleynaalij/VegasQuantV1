"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Copy, Gem, Plus, Upload, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { onUserChange } from "@/lib/auth-user";
import {
  rubyBrands,
  currentRubyFeature,
  rubyLegs,
  rubyLink,
  rubyOdds,
  rubyPrice,
  type RubySlip,
  type RubyFeature,
  type RubyHomeState,
} from "@/lib/ruby";
import CommunityPhoto from "./community-photo";
import { COMMUNITY_PHOTO_BUCKET } from "@/lib/community-photo";

export function RubyCard({
  slip,
  feature,
  admin = false,
  onFeatured,
}: {
  slip: RubySlip;
  feature?: RubyFeature;
  admin?: boolean;
  onFeatured?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");
  const [featuring, setFeaturing] = useState(false);
  const brand = rubyBrands.find((b) => b.theme === slip.theme) || rubyBrands[0];
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        [
          slip.brand,
          slip.title,
          ...slip.legs,
          slip.note,
          `Contributor opinion · ${location.origin}${rubyLink(slip.id)}`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
      setCopied(true);
    } catch {
      setNotice(
        "Copy is unavailable in this browser. Open the card link to share it.",
      );
    }
  }
  async function featureLay(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setFeaturing(true);
    setNotice("");
    try {
      const observed = new Date(String(f.get("observed")));
      if (!Number.isFinite(observed.getTime()))
        throw new Error("Enter the quote observation time.");
      const { error } = await supabase.rpc("feature_ruby", {
        p_submission: slip.id,
        p_odds: rubyOdds(String(f.get("odds"))),
        p_book: String(f.get("book")).trim(),
        p_source: String(f.get("source")).trim(),
        p_observed: observed.toISOString(),
      });
      if (error) throw error;
      setNotice("Featured as today’s Double Up. Original card preserved.");
      onFeatured?.();
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : (e as { message?: string }).message ||
              "Could not feature this lay.",
      );
    } finally {
      setFeaturing(false);
    }
  }
  return (
    <article className={`ruby-card ruby-${brand.theme}`} id={`ruby-${slip.id}`}>
      <div className="ruby-card-top">
        <span className="ruby-vq">
          VQ <span>VEGAS QUANT</span>
        </span>
        <span className="ruby-tier">
          <Gem size={12} /> RUBY
        </span>
      </div>
      <div className="ruby-signature">
        <span className="ruby-monogram" aria-hidden="true">
          {brand.monogram}
        </span>
        <div>
          <p>{brand.tagline}</p>
          <h3>{slip.brand}</h3>
        </div>
      </div>
      <div className="ruby-card-label">
        <span>
          {feature ? "DOUBLE UP · LAY OF THE DAY" : "CONTRIBUTOR DAILY LAY"}
        </span>
        <span>{slip.sport}</span>
      </div>
      <h4>{slip.title}</h4>
      {slip.legs.length > 0 && (
        <ol className="ruby-legs">
          {slip.legs.map((leg, i) => (
            <li key={i}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              {leg}
            </li>
          ))}
        </ol>
      )}
      {slip.photo_path && (
        <CommunityPhoto
          path={slip.photo_path}
          title={`${slip.brand} original slip`}
        />
      )}
      {slip.note && <p className="ruby-note">{slip.note}</p>}
      {feature ? (
        <div className="ruby-price">
          <strong>{rubyPrice(feature.verified_odds)}</strong>
          <span>
            {feature.sportsbook} · admin-verified quote
            <br />
            <a
              href={feature.source_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Observed{" "}
              {new Date(feature.observed_at).toLocaleString("en-US", {
                timeZone: "America/New_York",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}{" "}
              ET ↗
            </a>
          </span>
        </div>
      ) : (
        slip.reported_odds !== null && (
          <div className="ruby-price">
            <strong>{rubyPrice(slip.reported_odds)}</strong>
            <span>
              {slip.sportsbook}
              <br />
              Contributor-reported combined odds · unverified
            </span>
          </div>
        )
      )}
      <footer>
        <span>
          {slip.submission_day} · Contributor opinion
          <br />
          No guaranteed return. Prices can change.
        </span>
        <button
          type="button"
          className="ruby-icon-button"
          onClick={copy}
          aria-label="Copy this lay"
        >
          {copied ? <Check size={17} /> : <Copy size={17} />}
        </button>
        <Link
          className="ruby-icon-button"
          href={rubyLink(slip.id)}
          aria-label="Open this lay"
        >
          <ArrowUpRight size={18} />
        </Link>
      </footer>
      {admin && !feature && (
        <details className="ruby-curate">
          <summary>Feature as Double Up</summary>
          <form onSubmit={featureLay}>
            <p>
              Verify the complete slip and exact combined price. This features a
              contributor opinion, not an official/model pick. One feature per
              Eastern day.
            </p>
            <input
              name="odds"
              placeholder="Verified combined odds, +100 or better"
              required
              inputMode="text"
            />
            <input
              name="book"
              placeholder="Sportsbook"
              required
              maxLength={80}
            />
            <input
              name="source"
              placeholder="Exact HTTPS quote / ticket source"
              type="url"
              pattern="https://.*"
              required
            />
            <label>
              Quote observed at (your local time)
              <input type="datetime-local" name="observed" required />
            </label>
            <button disabled={featuring}>
              {featuring ? "Featuring…" : "Feature today’s lay"}
            </button>
          </form>
        </details>
      )}
      {notice && <p role="status">{notice}</p>}
    </article>
  );
}

function Composer({
  state,
  onPublished,
}: {
  state: RubyHomeState;
  onPublished: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [sport, setSport] = useState<"NFL" | "NBA">("NFL");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const modal = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        setOpen(false);
      }
      if (e.key === "Tab") {
        const elements = modal.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary",
        );
        if (!elements?.length) return;
        const first = elements[0],
          last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [open, busy]);
  const pending = useRef<string | null>(null);
  const epoch = useRef(0);
  useEffect(() => {
    const stop = onUserChange(() => {
      epoch.current++;
      setOpen(false);
      setFile(null);
      setMessage("");
    });
    return () => {
      epoch.current++;
      stop();
    };
  }, []);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const version = epoch.current;
    setBusy(true);
    setMessage("");
    const form = new FormData(e.currentTarget);
    let path: string | null = null;
    try {
      const legs = rubyLegs(text);
      if (legs.length < 2 && !file)
        throw new Error("Add at least two legs or upload a screenshot.");
      if (legs.length > 20 || legs.some((l) => l.length > 180))
        throw new Error("Use up to 20 legs, each under 181 characters.");
      const odds = rubyOdds(String(form.get("odds")));
      const book = String(form.get("book")).trim();
      if ((odds === null) !== !book)
        throw new Error(
          "Add both sportsbook and combined odds, or leave both blank.",
        );
      const { data } = await supabase.auth.getSession();
      if (!data.session || data.session.user.id !== state.user_id)
        throw new Error("Your account changed. Reopen the form.");
      const id = pending.current || crypto.randomUUID();
      pending.current = id;
      if (file) {
        const photo = new FormData();
        photo.set("photo", file);
        const response = await fetch(`/api/community/photo?post=${id}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${data.session.access_token}` },
          body: photo,
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Screenshot upload failed.");
        path = result.path;
      }
      if (version !== epoch.current)
        throw new Error("Account changed. Submission cancelled.");
      const result = await supabase.rpc("submit_ruby", {
        p_id: id,
        p_sport: sport,
        p_title: title.trim() || `${state.contributor!.brand}’s daily lay`,
        p_legs: legs,
        p_note: note,
        p_photo: path,
        p_book: book || null,
        p_odds: odds,
      });
      if (result.error) throw new Error(result.error.message);
      if (version === epoch.current) {
        setOpen(false);
        setMessage(
          "Published to The Zone. Member notifications have been queued according to their settings.",
        );
        setFile(null);
        pending.current = null;
        onPublished();
      }
    } catch (e) {
      // A lost RPC response can follow a committed insert: never delete its source image.
      if (path) {
        const { data: stored, error } = await supabase
          .from("ruby_submissions")
          .select("id")
          .eq("id", pending.current)
          .maybeSingle();
        if (!error && !stored) {
          await supabase.storage.from(COMMUNITY_PHOTO_BUCKET).remove([path]);
          pending.current = null;
        } else if (stored && version === epoch.current) {
          setOpen(false);
          setMessage("Your lay is published in The Zone.");
          onPublished();
          return;
        }
      }
      if (version === epoch.current) {
        setMessage(
          e instanceof Error ? e.message : "Could not publish. Please retry.",
        );
        onPublished();
      }
    } finally {
      if (version === epoch.current) setBusy(false);
    }
  }
  const contributor = state.contributor!;
  return (
    <section className="ruby-composer-home">
      <div>
        <span className="ruby-eyebrow">
          <Gem size={13} /> YOUR RUBY DESK
        </span>
        <h2>{contributor.brand}</h2>
        <p>
          {state.submitted
            ? "Your daily lay is live. Next slip opens at midnight Eastern."
            : "Your take. Your card. One lay a day."}
        </p>
      </div>
      {state.submitted ? (
        <Link className="ruby-primary" href={rubyLink(state.submitted)}>
          View your lay <ArrowUpRight size={17} />
        </Link>
      ) : (
        <button className="ruby-primary" onClick={() => setOpen(true)}>
          <Plus size={17} /> Submit today’s lay
        </button>
      )}
      {message && <p role="status">{message}</p>}
      {open && (
        <div className="ruby-modal-backdrop">
          <section
            ref={modal}
            className="ruby-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ruby-compose-title"
          >
            <header>
              <div>
                <span className="ruby-eyebrow">{contributor.brand} · RUBY</span>
                <h2 id="ruby-compose-title">Make your daily lay.</h2>
              </div>
              <button
                className="ruby-icon-button"
                aria-label="Close submission"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                <X />
              </button>
            </header>
            <form onSubmit={submit}>
              <p>
                Upload your screenshot and publish. No title, description or
                typed legs needed. One lay per Eastern day.
              </p>
              <label className="ruby-upload">
                <Upload size={18} /> Upload your slip
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    if (f && f.size > 5_000_000) {
                      setMessage("Choose a screenshot under 5 MB.");
                      return;
                    }
                    setFile(f);
                  }}
                />
              </label>
              {preview && (
                <div
                  className={`ruby-screenshot-preview ruby-${contributor.theme}`}
                >
                  <span>{contributor.brand} · RUBY</span>
                  <img src={preview} alt="Your original screenshot preview" />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setFile(null)}
                  >
                    Remove screenshot
                  </button>
                </div>
              )}
              <p className="ruby-fine">
                Screenshots are framed in your Ruby template, with the original
                kept intact. No automatic transcription. Crop out account
                numbers and balances before upload.
              </p>
              <details className="ruby-optional-fields">
                <summary>Add details · optional</summary>
                <label>
                  Sport · optional (NFL by default)
                  <select
                    aria-label="Sport"
                    value={sport}
                    onChange={(e) => setSport(e.target.value as "NFL" | "NBA")}
                    disabled={busy}
                  >
                    <option>NFL</option>
                    <option>NBA</option>
                  </select>
                </label>
                <label>
                  Card title · optional
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={90}
                    placeholder="Give your lay a name"
                    disabled={busy}
                  />
                </label>
                <label>
                  Your legs · optional, one per line
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={5}
                    placeholder={
                      "Player / team · market · selection\nAdd every leg exactly as it appears"
                    }
                    disabled={busy}
                  />
                </label>
                <div className="ruby-fields">
                  <label>
                    Sportsbook · optional
                    <input
                      name="book"
                      maxLength={80}
                      placeholder="Sportsbook"
                      disabled={busy}
                    />
                  </label>
                  <label>
                    Combined odds · optional
                    <input
                      name="odds"
                      placeholder="+450"
                      maxLength={8}
                      disabled={busy}
                    />
                  </label>
                </div>
                <label>
                  Your angle · optional
                  <textarea
                    value={note}
                    maxLength={1000}
                    rows={2}
                    onChange={(e) => setNote(e.target.value)}
                    disabled={busy}
                  />
                </label>
              </details>
              <details>
                <summary>Preview your Ruby card</summary>
                <RubyCard
                  slip={{
                    id: "preview",
                    user_id: state.user_id!,
                    brand: contributor.brand,
                    theme: contributor.theme,
                    submission_day: state.day!,
                    sport,
                    title: title.trim() || `${contributor.brand}’s daily lay`,
                    legs: rubyLegs(text),
                    note,
                    photo_path: null,
                    sportsbook: null,
                    reported_odds: null,
                    created_at: new Date().toISOString(),
                  }}
                />
              </details>
              {message && <p role="alert">{message}</p>}
              <button className="ruby-primary" disabled={busy}>
                {busy ? "Publishing your lay…" : "Publish to The Zone"}
              </button>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

export default function RubyHub({
  home = false,
  selectedId = "",
}: {
  home?: boolean;
  selectedId?: string;
}) {
  const [state, setState] = useState<RubyHomeState>({});
  const [slips, setSlips] = useState<RubySlip[]>([]);
  const [feature, setFeature] = useState<RubyFeature | null>(null);
  const [selected, setSelected] = useState("All");
  const [error, setError] = useState("");
  const [limit, setLimit] = useState(12);
  const epoch = useRef(0);
  async function refresh() {
    const version = ++epoch.current;
    const session = await supabase.auth.getSession();
    if (version !== epoch.current) return;
    if (!session.data.session) {
      setState({});
      setSlips([]);
      setFeature(null);
      setError("");
      return;
    }
    const [s, r, f] = await Promise.all([
      supabase.rpc("ruby_home"),
      supabase
        .from("ruby_submissions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(home ? 20 : limit),
      supabase
        .from("ruby_daily_features")
        .select("*")
        .order("day", { ascending: false })
        .limit(1),
    ]);
    if (version !== epoch.current) return;
    if (s.error || r.error || f.error) {
      setError("Contributor cards could not load. Please retry.");
      return;
    }
    const next = (s.data || {}) as RubyHomeState;
    setState(next);
    setSlips(r.data || []);
    const todayFeature = currentRubyFeature(next.day, f.data || []);
    setFeature(todayFeature);
    setError("");
    const neededId = selectedId || todayFeature?.submission_id || "";
    if (neededId && !r.data?.some((x) => x.id === neededId)) {
      const one = await supabase
        .from("ruby_submissions")
        .select("*")
        .eq("id", neededId)
        .maybeSingle();
      if (version === epoch.current && one.data)
        setSlips((current) => [one.data, ...current]);
    }
  }
  useEffect(() => {
    void refresh();
    const stop = onUserChange(() => {
      epoch.current++;
      setState({});
      setSlips([]);
      setFeature(null);
      void refresh();
    });
    const interval = setInterval(() => void refresh(), 60000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      epoch.current++;
      stop();
      clearInterval(interval);
      window.removeEventListener("focus", focus);
    };
  }, [home, limit, selectedId]); // account epochs reject stale reads
  useEffect(() => {
    if (selectedId && slips.some((s) => s.id === selectedId))
      document
        .getElementById(`ruby-${selectedId}`)
        ?.scrollIntoView({ block: "start" });
  }, [selectedId, slips]);
  const featured = feature && slips.find((s) => s.id === feature.submission_id);
  const visible = slips.filter(
    (s) =>
      (!home || selected !== "All") &&
      (selected === "All" || s.brand === selected) &&
      (!home || s.submission_day === state.day),
  );
  return (
    <div className="ruby-hub">
      {home && state.contributor && (
        <Composer
          key={state.user_id}
          state={state}
          onPublished={() => void refresh()}
        />
      )}
      {home && (
        <section className="ruby-double-up">
          <div>
            <span className="ruby-eyebrow">TODAY’S DOUBLE UP</span>
            <h2>One lay. +100 or better.</h2>
            <p>
              {featured
                ? "Today’s featured contributor lay. See the complete slip and quote below."
                : "The daily feature appears here after a qualifying slip and its combined price are verified."}
            </p>
          </div>
          {featured && feature ? (
            <RubyCard slip={featured} feature={feature} />
          ) : (
            <Link className="ruby-text-link" href="/feed?view=contributors">
              Explore contributor lays <ArrowUpRight size={16} />
            </Link>
          )}
        </section>
      )}
      <section className="ruby-contributors">
        <header>
          <div>
            <span className="ruby-eyebrow">FOUR VOICES. THEIR OWN GAME.</span>
            <h2>Ruby contributors</h2>
          </div>
          {home && (
            <Link href="/feed?view=contributors" className="ruby-text-link">
              View all <ArrowUpRight size={16} />
            </Link>
          )}
        </header>
        <nav className="ruby-people" aria-label="Choose a contributor">
          {!home && (
            <button
              className={selected === "All" ? "is-selected" : ""}
              onClick={() => setSelected("All")}
            >
              All lays
            </button>
          )}
          {rubyBrands.map((b) => (
            <button
              key={b.brand}
              className={`ruby-person ruby-${b.theme} ${selected === b.brand ? "is-selected" : ""}`}
              onClick={() =>
                setSelected(selected === b.brand ? "All" : b.brand)
              }
              aria-pressed={selected === b.brand}
            >
              <span className="ruby-avatar">{b.monogram}</span>
              <strong>{b.brand}</strong>
              <span>
                {slips.some(
                  (s) => s.brand === b.brand && s.submission_day === state.day,
                )
                  ? "Today’s lay is in"
                  : "Daily contributor"}
              </span>
            </button>
          ))}
        </nav>
        {error && (
          <p role="status">
            {error} <button onClick={() => void refresh()}>Retry</button>
          </p>
        )}
        <div className="ruby-grid">
          {visible.map((s) => (
            <RubyCard
              key={s.id}
              slip={s}
              feature={feature?.submission_id === s.id ? feature : undefined}
              admin={state.admin}
              onFeatured={() => void refresh()}
            />
          ))}
        </div>
        {!visible.length && !error && (!home || selected !== "All") && (
          <p className="ruby-empty">
            {home
              ? "Today’s contributor lays will appear here as they are submitted."
              : "No lays here yet. Check another contributor or come back for their daily drop."}
          </p>
        )}
        {!home && slips.length >= limit && (
          <button className="ruby-more" onClick={() => setLimit((n) => n + 12)}>
            Load earlier lays
          </button>
        )}
      </section>
    </div>
  );
}
