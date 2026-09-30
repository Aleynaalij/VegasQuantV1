"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import {
  money,
  odd,
  signedMoney,
  winProfit,
  time,
  type Challenge,
  type Pick,
  type Result,
} from "@/lib/domain";
import {
  personalTotals,
  type PersonalAccount,
  type PersonalEntry,
  type PersonalSettlement,
} from "@/lib/personal";
import { Badge, Stat } from "./ui";
export default function PersonalChallenge({
  challenge,
  pick,
  picks,
  results,
  children,
}: {
  challenge: Challenge;
  pick?: Pick;
  picks: Pick[];
  results: Result[];
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<"official" | "personal">("official");
  const [account, setAccount] = useState<PersonalAccount | null>(null),
    [entries, setEntries] = useState<PersonalEntry[]>([]),
    [settlements, setSettlements] = useState<PersonalSettlement[]>([]);
  const [loading, setLoading] = useState(true),
    [notice, setNotice] = useState(""),
    [saving, setSaving] = useState(false);
  const [odds, setOdds] = useState(""),
    [stake, setStake] = useState(""),
    [payout, setPayout] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    generation = useRef(0),
    initialized = useRef(false);
  const load = useCallback(async () => {
    const run = ++generation.current;
    try {
      const a = await supabase
        .from("personal_challenges")
        .select("id,starting_cents")
        .eq("challenge_id", challenge.id)
        .maybeSingle();
      if (a.error) throw a.error;
      let es: PersonalEntry[] = [],
        ss: PersonalSettlement[] = [];
      if (a.data) {
        const e = await supabase
          .from("personal_entries")
          .select("*")
          .eq("personal_challenge_id", a.data.id)
          .order("created_at");
        if (e.error) throw e.error;
        es = e.data;
        if (es.length) {
          const s = await supabase
            .from("personal_settlements")
            .select("entry_id,result,profit_cents")
            .in(
              "entry_id",
              es.map((e) => e.id),
            );
          if (s.error) throw s.error;
          ss = s.data;
        }
      }
      if (run === generation.current) {
        if (!initialized.current) {
          if (a.data) setView("personal");
          initialized.current = true;
        }
        setAccount(a.data);
        setEntries(es);
        setSettlements(ss);
        setLoading(false);
      }
    } catch {
      if (run === generation.current) {
        setNotice("Unable to load your entries. Refresh to try again.");
        setLoading(false);
      }
    }
  }, [challenge.id]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    window.addEventListener("focus", load);
    return () => {
      generation.current++;
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [load]);
  useEffect(() => {
    void load();
  }, [results, load]);
  const totals = personalTotals(
    account?.starting_cents ?? challenge.starting_cents,
    entries,
    settlements,
  );
  const current = entries.find((e) => e.pick_id === pick?.id);
  const ended = results.some((r) => r.pick_id === pick?.id);
  function estimate(o: string, s: string) {
    const n = Number(o),
      c = Math.round(Number(s) * 100);
    setPayout(
      o && s && Math.abs(n) >= 100 && c > 0
        ? ((c + winProfit(c, n)) / 100).toFixed(2)
        : "",
    );
  }
  function open() {
    setNotice("");
    setOdds("");
    setStake("");
    setPayout("");
    setIsOpen(true);
    dialog.current?.showModal();
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pick || saving) return;
    setSaving(true);
    setNotice("");
    const form = new FormData(event.currentTarget);
    const dollars = (key: string) => Math.round(Number(form.get(key)) * 100);
    try {
      const r = await supabase.rpc("record_personal_entry", {
        p_pick_id: pick.id,
        p_line: pick.market === "Moneyline" ? null : Number(form.get("line")),
        p_odds: Number(odds),
        p_stake_cents: dollars("stake"),
        p_payout_cents: dollars("payout"),
        p_book: String(form.get("book")),
        p_placed_at: new Date(String(form.get("placed_at"))).toISOString(),
        p_starting_cents: account?.starting_cents ?? dollars("starting"),
      });
      if (r.error) throw r.error;
      await load();
      setView("personal");
      dialog.current?.close();
      setNotice("Your actual entry is recorded.");
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : (e as { message?: string }).message || "Unable to record entry.",
      );
    } finally {
      setSaving(false);
    }
  }
  const localNow = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };
  return (
    <section className="personal-challenge" aria-label="Challenge tracking">
      <div className="personal-toolbar">
        <div className="personal-switch" aria-label="Bankroll view">
          <button
            type="button"
            aria-pressed={view === "official"}
            onClick={() => setView("official")}
          >
            Official challenge
          </button>
          <button
            type="button"
            aria-pressed={view === "personal"}
            onClick={() => setView("personal")}
          >
            My challenge
          </button>
        </div>
        {pick && !ended && !current && (
          <button className="primary" disabled={loading} onClick={open}>
            I played this
          </button>
        )}
        {current && (
          <Badge tone="green">
            {settlements.find((s) => s.entry_id === current.id)?.result ??
              "IN PLAY"}
          </Badge>
        )}
      </div>
      <p className="personal-caption">
        {view === "official"
          ? "Official published challenge. Your entries are tracked separately."
          : "Your recorded cash wagers. Visible to you and verified admins."}
      </p>
      {view === "official" ? (
        children
      ) : loading ? (
        <p>Loading your challenge…</p>
      ) : (
        <>
          <section
            className={`stats personal-stats ${totals.inPlay > 0 ? "is-in-play" : ""}`}
            aria-label="Your bankroll"
          >
            <Stat
              label="Your starting bankroll"
              value={money(account?.starting_cents ?? challenge.starting_cents)}
              note={
                account
                  ? "Recorded when you joined"
                  : "Set when recording your first entry"
              }
            />
            <Stat
              label="Your current bankroll"
              value={money(totals.balance)}
              note={`${signedMoney(totals.net)} settled P/L · ${money(totals.available)} available`}
            />
            <Stat
              label={totals.inPlay ? "In play" : "Potential payout"}
              value={money(totals.inPlay || 0)}
              note={
                totals.inPlay
                  ? `${money(totals.payout)} total return if open entries win`
                  : "No unsettled entries"
              }
            />
            <Stat
              label="Your record"
              value={`${totals.wins} W / ${totals.losses} L`}
              note={
                totals.inPlay
                  ? `${money(totals.ifWin)} balance if open entries win`
                  : "Only your recorded entries count"
              }
            />
          </section>
          {entries.length > 0 && (
            <details className="personal-history">
              <summary>Your entries ({entries.length})</summary>
              {entries.map((e) => {
                const s = settlements.find((s) => s.entry_id === e.id);
                const published = picks.find((p) => p.id === e.pick_id);
                const needsReview =
                  !s && results.some((r) => r.pick_id === e.pick_id);
                return (
                  <article key={e.id}>
                    <strong>{published?.selection || "Official pick"}</strong>
                    <p>
                      Actual line: {e.line ?? "Moneyline"} · {odd(e.odds)} ·{" "}
                      {e.book}
                    </p>
                    <p>
                      {money(e.stake_cents)} staked · {money(e.payout_cents)}{" "}
                      total return if win
                    </p>
                    <Badge tone={s?.result === "LOSS" ? "red" : "green"}>
                      {s?.result ??
                        (needsReview ? "AWAITING INDIVIDUAL GRADE" : "IN PLAY")}
                    </Badge>
                    {s && <span> {signedMoney(s.profit_cents)} P/L</span>}
                    <small>
                      Placed {time(e.placed_at)} · Recorded {time(e.created_at)}
                    </small>
                  </article>
                );
              })}
            </details>
          )}
        </>
      )}
      {!isOpen && notice && <p role="status">{notice}</p>}
      <dialog
        onClose={() => setIsOpen(false)}
        ref={dialog}
        className="entry-dialog"
        aria-labelledby="entry-title"
      >
        <form onSubmit={save} className="member-form">
          <h2 id="entry-title">Record your actual entry</h2>
          <p>{pick?.selection}</p>
          <p>
            This records a wager you already placed. It does not place a bet.
            Entries are retained; admins can see your entry and stake.
          </p>
          {!account && (
            <label>
              Your starting challenge bankroll ($)
              <input
                name="starting"
                type="number"
                min="0.01"
                max="1000000"
                step="0.01"
                defaultValue="20"
                required
              />
            </label>
          )}
          <label>
            Sportsbook
            <select name="book" required defaultValue="">
              <option value="" disabled>
                Select your sportsbook
              </option>
              <option>FanDuel</option>
              <option>DraftKings</option>
              <option>Other</option>
            </select>
          </label>
          {pick?.market !== "Moneyline" && (
            <label>
              Your actual line
              <input
                name="line"
                type="number"
                step="any"
                required
                placeholder={String(pick?.recommended_line ?? "")}
              />
            </label>
          )}
          <label>
            Your American odds
            <input
              inputMode="decimal"
              type="number"
              name="odds"
              required
              step="any"
              value={odds}
              onChange={(e) => {
                setOdds(e.target.value);
                estimate(e.target.value, stake);
              }}
              placeholder="e.g. -114"
            />
          </label>
          <label>
            Amount staked ($)
            <input
              inputMode="decimal"
              type="number"
              name="stake"
              required
              min="0.01"
              max="1000000"
              step="0.01"
              value={stake}
              onChange={(e) => {
                setStake(e.target.value);
                estimate(odds, e.target.value);
              }}
            />
          </label>
          <label>
            Total payout if win, including stake ($)
            <input
              inputMode="decimal"
              type="number"
              name="payout"
              required
              min={stake || "0.01"}
              max="1000000"
              step="0.01"
              value={payout}
              onChange={(e) => setPayout(e.target.value)}
            />
          </label>
          <small>
            Calculated from your odds; confirm against your bet receipt.
            Standard cash wagers only.
          </small>
          <label>
            When did you place it? (your local time)
            <input
              name="placed_at"
              type="datetime-local"
              required
              defaultValue={localNow()}
            />
          </label>
          {payout && stake && (
            <p>
              Potential profit:{" "}
              <strong>
                {money(Math.round((Number(payout) - Number(stake)) * 100))}
              </strong>
            </p>
          )}
          <label className="entry-confirm">
            <input type="checkbox" required /> I already placed this wager and
            these are my actual terms. The saved entry is permanent.
          </label>
          {notice && <p role="alert">{notice}</p>}
          <div className="personal-toolbar">
            <button
              type="button"
              className="secondary"
              disabled={saving}
              onClick={() => dialog.current?.close()}
            >
              Cancel
            </button>
            <button className="primary" disabled={saving}>
              {saving ? "Recording…" : "Confirm · In play"}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
