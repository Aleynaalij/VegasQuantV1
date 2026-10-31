"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Gem,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { onUserChange } from "@/lib/auth-user";
import {
  rubyBrands,
  contributorTier,
  contributorSports,
  type ContributorSport,
  rubyLegs,
  rubyLink,
  rubyOdds,
  rubyPrice,
  rankCappers,
  type CapperRecord,
  type RubySlip,
  type RubyHomeState,
} from "@/lib/ruby";
import CommunityPhoto from "./community-photo";
import GamblyLink from "./gambly-link";
import {
  clipboardPhoto,
  communityPhotoPng,
  pastedPhoto,
} from "@/lib/community-photo-clipboard";
import { COMMUNITY_PHOTO_BUCKET } from "@/lib/community-photo";
import {
  MAX_SELECTED_PHOTO_BYTES,
  uploadCommunityPhoto,
} from "@/lib/community-photo-client";

export function RubyCard({
  slip,
  admin = false,
  onFeatured,
}: {
  slip: RubySlip;
  admin?: boolean;
  onFeatured?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");
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
  return (
    <article className={`ruby-card ruby-${brand.theme}`} id={`ruby-${slip.id}`}>
      <div className="ruby-card-top">
        <span className="ruby-vq">
          VQ <span>VEGAS QUANT</span>
        </span>
        <span className="ruby-tier">
          <Gem size={12} /> {contributorTier(brand.theme)}
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
        <span>CONTRIBUTOR DAILY LAY</span>
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
      {slip.reported_odds !== null && (
        <div className="ruby-price">
          <strong>{rubyPrice(slip.reported_odds)}</strong>
          <span>
            {slip.sportsbook}
            <br />
            Contributor-reported combined odds · unverified
          </span>
        </div>
      )}
      {slip.reported_result && (
        <p className="ruby-fine">
          Contributor-reported: {slip.reported_result} · not independently
          verified
        </p>
      )}
      {admin && (
        <button
          type="button"
          className="ruby-text-link"
          onClick={async () => {
            const r = await supabase.rpc("hide_ruby", {
              p_submission: slip.id,
              p_hidden: !slip.hidden,
            });
            setNotice(
              r.error
                ? r.error.message
                : slip.hidden
                  ? "Restored to The Zone."
                  : "Removed from The Zone. History and record retained.",
            );
            if (!r.error) onFeatured?.();
          }}
        >
          {slip.hidden ? "Restore to The Zone" : "Remove from The Zone"}
        </button>
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
      {slip.id !== "preview" && (
        <div className="ruby-gambly">
          {/* Typed legs copy as text; a screenshot-only lay copies the screenshot itself. */}
          <GamblyLink
            url="https://gambly.com/"
            selection={slip.legs.length ? slip.legs.join("\n") : undefined}
            kalshiTexts={slip.legs}
            image={
              !slip.legs.length && slip.photo_path
                ? () => communityPhotoPng(slip.photo_path!)
                : undefined
            }
            label={
              slip.legs.length
                ? "Copy lay & open with Gambly ↗"
                : slip.photo_path
                  ? "Copy screenshot & open with Gambly ↗"
                  : "Open with Gambly ↗"
            }
          />
        </div>
      )}
      {admin && <AdminCardEditor slip={slip} onSaved={onFeatured} />}
      {!!slip.revision && (
        <p className="ruby-fine">
          Edited by admin · revision {slip.revision}. Original retained in
          history.
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </article>
  );
}

function AdminCardEditor({
  slip,
  onSaved,
}: {
  slip: RubySlip;
  onSaved?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Sign in again.");
      let photo = f.get("remove_photo") ? null : slip.photo_path;
      const file = f.get("photo");
      if (file instanceof File && file.size)
        photo = await uploadCommunityPhoto(
          file,
          crypto.randomUUID(),
          data.session.access_token,
        );
      const { error } = await supabase.rpc("edit_ruby", {
        p_submission: slip.id,
        p_expected: slip.revision || 0,
        p_title: String(f.get("title")).trim(),
        p_legs: rubyLegs(String(f.get("legs"))),
        p_note: String(f.get("note")),
        p_sport: String(f.get("sport")),
        p_book: String(f.get("book")).trim() || null,
        p_odds: rubyOdds(String(f.get("odds"))),
        p_photo: photo,
      });
      if (error) throw new Error(error.message);
      setEditing(false);
      setMessage("Card updated. Original preserved.");
      onSaved?.();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ruby-curate">
      <button
        type="button"
        className="ruby-primary"
        onClick={() => setEditing(!editing)}
        disabled={busy}
      >
        {editing ? "Cancel edit" : "Edit card"}
      </button>
      {editing && (
        <form onSubmit={save} key={`${slip.id}-${slip.revision || 0}`}>
          <p>
            Admin edit. The original stays in history. Edits do not create a
            extra daily submission or resend publication alerts.
          </p>
          <label>
            Title · optional
            <input name="title" defaultValue={slip.title} maxLength={90} />
          </label>
          <label>
            Sport
            <select name="sport" defaultValue={slip.sport}>
              {contributorSports.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Legs · optional
            <textarea
              name="legs"
              defaultValue={slip.legs.join("\n")}
              rows={5}
            />
          </label>
          <label>
            Description · optional
            <textarea name="note" defaultValue={slip.note} maxLength={1000} />
          </label>
          <label>
            Sportsbook · optional
            <input
              name="book"
              defaultValue={slip.sportsbook || ""}
              maxLength={80}
            />
          </label>
          <label>
            Combined odds · optional
            <input
              name="odds"
              defaultValue={slip.reported_odds ?? ""}
              inputMode="text"
            />
          </label>
          <label>
            Replace screenshot · optional
            <input
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
            />
          </label>
          {slip.photo_path && (
            <label>
              <span>
                <input name="remove_photo" type="checkbox" /> Remove current
                screenshot
              </span>
            </label>
          )}
          <button className="ruby-primary" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </div>
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
  const [sport, setSport] = useState<ContributorSport>("NFL");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pasteHelp, setPasteHelp] = useState(false);
  function choosePhoto(f: File | null) {
    if (f && f.size > MAX_SELECTED_PHOTO_BYTES) {
      setMessage("Choose a screenshot under 25 MB.");
      return;
    }
    setMessage("");
    setPasteHelp(false);
    setFile(f);
  }
  async function pastePhoto() {
    try {
      const f = await clipboardPhoto();
      if (f) return choosePhoto(f);
      setMessage(
        "No screenshot on your clipboard. Copy the slip image first, then tap Paste.",
      );
    } catch {
      // Browsers that block clipboard reads still allow a press-and-hold paste.
      setPasteHelp(true);
    }
  }
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
      if (file)
        path = await uploadCommunityPhoto(file, id, data.session.access_token);
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
          .from("ruby_cards")
          .select("id")
          .eq("id", pending.current)
          .maybeSingle();
        if (!error && !stored) {
          await supabase.storage.from(COMMUNITY_PHOTO_BUCKET).remove([path]);
          pending.current = null;
        } else if (stored && version === epoch.current) {
          // Published despite the lost response: start the next slip fresh, as on normal success.
          setOpen(false);
          setMessage("Your lay is published in The Zone.");
          setFile(null);
          pending.current = null;
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
    <section
      className={`ruby-composer-home ruby-submit-compact ruby-${contributor.theme}`}
    >
      <details className="ruby-submit-drawer">
        <summary aria-label="Submit today’s lay options">
          <Gem size={16} aria-hidden="true" />
          <span>Submit today’s lay</span>
          <small>{state.submission_count || 0} / 3</small>
          <ChevronRight
            className="ruby-submit-chevron"
            size={18}
            aria-hidden="true"
          />
        </summary>
        <div className="ruby-submit-content">
          <div>
            <span className="ruby-eyebrow">
              <Gem size={13} /> YOUR {contributorTier(contributor.theme)} DESK
            </span>
            <h2>{contributor.brand}</h2>
            <p>
              {`${state.submission_count || 0} / 3 slips posted today. Resets at midnight Eastern.`}
            </p>
          </div>
          {(state.submission_count || 0) >= 3 && state.submitted ? (
            <Link className="ruby-primary" href={rubyLink(state.submitted)}>
              View your lay <ArrowUpRight size={17} />
            </Link>
          ) : (
            <button className="ruby-primary" onClick={() => setOpen(true)}>
              <Plus size={17} /> Submit today’s lay
            </button>
          )}
          {state.submitted && (state.submission_count || 0) < 3 && (
            <Link className="ruby-text-link" href={rubyLink(state.submitted)}>
              View your lay
            </Link>
          )}
        </div>
      </details>
      {message && (
        <p className="ruby-submit-message" role="status">
          {message}
        </p>
      )}
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
                <span className="ruby-eyebrow">
                  {contributor.brand} · {contributorTier(contributor.theme)}
                </span>
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
            <form
              onSubmit={submit}
              onPaste={(e) => {
                const f = pastedPhoto(e.clipboardData);
                if (!f || busy) return;
                e.preventDefault();
                choosePhoto(f);
              }}
            >
              <p>
                Upload your screenshot and publish. No title, description or
                typed legs needed. Up to three slips per Eastern day.
              </p>
              <label className="ruby-upload">
                <Upload size={18} /> Upload your slip
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  onChange={(e) => choosePhoto(e.target.files?.[0] || null)}
                />
              </label>
              <button
                type="button"
                className="ruby-paste"
                disabled={busy}
                onClick={() => void pastePhoto()}
              >
                <ClipboardPaste size={18} /> Paste screenshot
              </button>
              {pasteHelp && (
                <div
                  className="ruby-paste-target"
                  contentEditable
                  suppressContentEditableWarning
                  role="textbox"
                  aria-label="Press and hold here, then choose Paste"
                  onInput={(e) => (e.currentTarget.textContent = "")}
                >
                  Press and hold here, then choose Paste.
                </div>
              )}
              {preview && (
                <div
                  className={`ruby-screenshot-preview ruby-${contributor.theme}`}
                >
                  <span>
                    {contributor.brand} · {contributorTier(contributor.theme)}
                  </span>
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
                Screenshots are framed in your signature template, with the
                original kept intact. No automatic transcription. Crop out
                account numbers and balances before upload.
              </p>
              <details className="ruby-optional-fields">
                <summary>Add details · optional</summary>
                <label>
                  Sport · optional (NFL by default)
                  <select
                    aria-label="Sport"
                    value={sport}
                    onChange={(e) =>
                      setSport(e.target.value as ContributorSport)
                    }
                    disabled={busy}
                  >
                    {contributorSports.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
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
                <summary>Preview your card</summary>
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

function ResultPrompt({
  state,
  onSaved,
}: {
  state: RubyHomeState;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const card = state.due?.[0];
  useEffect(() => {
    setConfirmed(false);
    setMessage("");
  }, [card?.id]);
  if (!card) return null;
  async function report(outcome: string) {
    setBusy(true);
    setMessage("");
    const r = await supabase.rpc("report_ruby", {
      p_submission: card!.id,
      p_outcome: outcome,
      p_revision: card!.revision,
    });
    setBusy(false);
    if (r.error) setMessage(r.error.message);
    else onSaved();
  }
  return (
    <section className="ruby-double-up" aria-label="Confirm your slip result">
      <span className="ruby-eyebrow">
        YOUR RECORD · {state.due!.length} TO REVIEW
      </span>
      <h2>Did this slip clear?</h2>
      <h3>{card.title}</h3>
      {card.legs.map((l, i) => (
        <p key={i}>{l}</p>
      ))}
      {card.photo_path && (
        <CommunityPhoto
          path={card.photo_path}
          title="Original submission to review"
        />
      )}
      <p>
        Only confirm once every leg has settled. Your answer is shown as
        contributor-reported, not independently verified. Pending slips stay out
        of your win/loss record.
      </p>
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />{" "}
        All legs have settled; I checked the ticket.
      </label>
      <div className="ruby-result-actions">
        {[
          ["WIN", "Cleared"],
          ["LOSS", "Didn’t clear"],
          ["VOID", "Voided / refunded"],
        ].map(([v, label]) => (
          <button
            type="button"
            className="ruby-primary"
            key={v}
            disabled={busy || !confirmed}
            onClick={() => void report(v)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="ruby-text-link"
          disabled={busy}
          onClick={() => void report("PENDING")}
        >
          Still pending · ask tomorrow
        </button>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}

export default function RubyHub({
  home = false,
  composerOnly = false,
  leaderboardOnly = false,
  zone = false,
  selectedId = "",
  contributorsOnly = false,
}: {
  home?: boolean;
  composerOnly?: boolean;
  leaderboardOnly?: boolean;
  zone?: boolean;
  selectedId?: string;
  /** Show only to contributors and admins; everyone else opens it from the Contributors tab. */
  contributorsOnly?: boolean;
}) {
  const [state, setState] = useState<RubyHomeState>({});
  const [records, setRecords] = useState<CapperRecord[]>([]);
  const [slips, setSlips] = useState<RubySlip[]>([]);
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
      setError("");
      return;
    }
    if (leaderboardOnly) {
      const homeState = await supabase.rpc("ruby_home");
      if (version !== epoch.current) return;
      const next = (homeState.data || {}) as RubyHomeState;
      setState(next);
      if (!next.contributor) {
        setRecords([]);
        return;
      }
      const record = await supabase.rpc("ruby_record_summary");
      if (version !== epoch.current) return;
      setRecords(record.error ? [] : record.data || []);
      return;
    }
    const [s, r] = await Promise.all([
      supabase.rpc("ruby_home"),
      supabase
        .from("ruby_cards")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(home ? 20 : limit),
    ]);
    if (version !== epoch.current) return;
    if (s.error || r.error) {
      setError("Contributor cards could not load. Please retry.");
      return;
    }
    const next = (s.data || {}) as RubyHomeState;
    setState(next);
    const record = await supabase.rpc("ruby_record_summary");
    if (version !== epoch.current) return;
    setRecords(record.error ? [] : record.data || []);
    setSlips(r.data || []);
    setError("");
    const neededId = selectedId;
    if (neededId && !r.data?.some((x) => x.id === neededId)) {
      const one = await supabase
        .from("ruby_cards")
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
      void refresh();
    });
    const interval = setInterval(() => void refresh(), 60000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    window.addEventListener("vq:ruby-result-saved", focus);
    return () => {
      epoch.current++;
      stop();
      clearInterval(interval);
      window.removeEventListener("focus", focus);
      window.removeEventListener("vq:ruby-result-saved", focus);
    };
  }, [home, leaderboardOnly, limit, selectedId]); // account epochs reject stale reads
  useEffect(() => {
    if (selectedId && slips.some((s) => s.id === selectedId))
      document
        .getElementById(`ruby-${selectedId}`)
        ?.scrollIntoView({ block: "start" });
  }, [selectedId, slips]);
  const visible = slips.filter(
    (s) =>
      (!home || selected !== "All") &&
      (selected === "All" || s.brand === selected) &&
      (!home || s.submission_day === state.day),
  );
  if (contributorsOnly && !state.contributor && !state.admin) return null;
  // Contributors and admins see the whole board; members see one capper's record by opening them.
  const insider = !!state.contributor || !!state.admin;
  const ranked = rankCappers(records);
  const profile =
    selected === "All" ? null : ranked.find((r) => r.brand === selected);
  if (leaderboardOnly)
    return (
      <div className="ruby-hub">
        {state.contributor && ranked.length > 0 && (
          <section className="ruby-board" aria-labelledby="ruby-board-title">
            <header>
              <span className="ruby-board-kicker" id="ruby-board-title">
                <i aria-hidden="true" /> CAPPER BOARD
              </span>
              <span className="ruby-board-chip">SELF-REPORTED</span>
            </header>
            <table>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Capper</th>
                  <th scope="col">W</th>
                  <th scope="col">L</th>
                  <th scope="col">
                    <abbr title="Void">V</abbr>
                  </th>
                  <th scope="col">
                    <abbr title="Pending">P</abbr>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((r) => (
                  <tr key={r.brand}>
                    <td className="ruby-board-rank">{r.rank}</td>
                    <th scope="row">{r.brand}</th>
                    <td>
                      <b>{r.wins}</b>
                    </td>
                    <td>
                      <b>{r.losses}</b>
                    </td>
                    <td>
                      <b>{r.voids}</b>
                    </td>
                    <td>
                      <b>{r.pending}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Results are reported by each capper the day after, not
              independently verified. Voids and pending slips stay out of wins
              and losses. Small samples aren’t proof of future performance.
            </p>
          </section>
        )}
      </div>
    );
  if (composerOnly)
    return (
      <div className="ruby-hub">
        {state.contributor ? (
          <Composer
            key={state.user_id}
            state={state}
            onPublished={() => void refresh()}
          />
        ) : null}
        {state.due?.length ? (
          <ResultPrompt
            state={state}
            onSaved={() =>
              window.dispatchEvent(new Event("vq:ruby-result-saved"))
            }
          />
        ) : null}
      </div>
    );
  return (
    <div className="ruby-hub">
      {(home || zone) && state.contributor && (
        <Composer
          key={state.user_id}
          state={state}
          onPublished={() => void refresh()}
        />
      )}
      {(home || zone) && state.due?.length ? (
        <ResultPrompt
          state={state}
          onSaved={() =>
            window.dispatchEvent(new Event("vq:ruby-result-saved"))
          }
        />
      ) : null}
      <section className="ruby-contributors">
        <header>
          <div>
            <span className="ruby-eyebrow">THEIR VOICES. THEIR OWN GAME.</span>
            <h2>Signature contributors</h2>
          </div>
          {home && (
            <Link href="/community?view=vip" className="ruby-text-link">
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
              {insider && (
                <span className="ruby-person-record">
                  {(() => {
                    const r = ranked.find((x) => x.brand === b.brand);
                    return r ? `${r.wins}–${r.losses}` : "No results yet";
                  })()}
                </span>
              )}
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
        {selected !== "All" && (
          <div className="ruby-profile-record" role="status">
            <strong>{selected}</strong>
            {profile && profile.wins + profile.losses + profile.voids > 0 ? (
              <>
                {insider && (
                  <span className="ruby-profile-rank">
                    #{profile.rank} of {ranked.length}
                  </span>
                )}
                <span className="ruby-profile-wl">
                  {profile.wins}–{profile.losses}
                </span>
                <small>
                  {profile.voids} void · {profile.pending} pending ·
                  self-reported, not independently verified
                </small>
              </>
            ) : (
              <small>No reported results yet.</small>
            )}
          </div>
        )}
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
