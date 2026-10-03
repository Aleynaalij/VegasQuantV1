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
  entryBalances,
  type PersonalAccount,
  type PersonalEntry,
  type PersonalSettlement,
} from "@/lib/personal";
import ChallengeRun from "./challenge-run";
import type { Stage } from "@/lib/domain";
import EntryCorrection from "./entry-correction";
import { Badge } from "./ui";
export default function PersonalChallenge({
  challenge,
  stages,
  pick,
  picks,
  results,
  renderOfficial,
}: {
  challenge: Challenge;
  stages: Stage[];
  pick?: Pick;
  picks: Pick[];
  results: Result[];
  renderOfficial?: (entryAction: ReactNode) => ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [adjustments, setAdjustments] = useState<
    { id: string; delta_cents: number; reason: string; created_at: string }[]
  >([]);
  const [editingBalance, setEditingBalance] = useState(false),
    [newBalance, setNewBalance] = useState(""),
    [balanceReason, setBalanceReason] = useState("Balance correction");
  const [starting, setStarting] = useState("20");
  const [loadError, setLoadError] = useState(false);
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
    generation = useRef(0);
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
          .from("personal_entry_state")
          .select("*")
          .eq("personal_challenge_id", a.data.id)
          .order("created_at");
        if (e.error) throw e.error;
        es = e.data;
        ss = es.flatMap((e) =>
          e.result
            ? [
                {
                  entry_id: e.id,
                  result: e.result,
                  profit_cents: e.profit_cents ?? 0,
                },
              ]
            : [],
        );
      }
      const changes = a.data
        ? await supabase
            .from("personal_bankroll_adjustments")
            .select("id,delta_cents,reason,created_at")
            .eq("personal_challenge_id", a.data.id)
            .order("created_at", { ascending: false })
        : { data: [], error: null };
      if (changes.error) throw changes.error;
      if (run === generation.current) {
        setAdjustments(changes.data || []);
        setLoadError(false);
        setAccount(a.data);
        setEntries(es);
        setSettlements(ss);
        setLoading(false);
      }
    } catch {
      if (run === generation.current) {
        setLoadError(true);
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
    adjustments.reduce((sum, a) => sum + Number(a.delta_cents), 0),
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
  const entryAction = (
    <div className="slip-entry-action">
      {current && (
        <div className="slip-personal-entry">
          <Badge tone="green">
            {settlements.find((s) => s.entry_id === current.id)?.result ??
              (ended ? "AWAITING GRADE" : "IN PLAY")}
          </Badge>
          <p>
            Your entry: {current.line === null ? "Moneyline" : current.line} ·{" "}
            {odd(current.odds)} · {money(current.stake_cents)} staked
          </p>
          <small>
            {current.book} · {money(current.payout_cents)} total return if win
          </small>
        </div>
      )}
    </div>
  );
  async function setup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || loadError) return;
    setSaving(true);
    setNotice("");
    try {
      const r = await supabase.rpc("start_personal_bankroll", {
        p_challenge_id: challenge.id,
        p_starting_cents: Math.round(Number(starting) * 100),
      });
      if (r.error) throw r.error;
      await load();
      setNotice("Your starting bankroll is saved. No wager was recorded.");
    } catch (e) {
      setNotice(
        (e as { message?: string }).message ||
          "Could not save your starting bankroll.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function updateBalance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account || saving || loadError) return;
    const cents = Math.round(Number(newBalance) * 100);
    if (
      !Number.isSafeInteger(cents) ||
      cents < totals.inPlay ||
      cents > 100000000
    ) {
      setNotice("Enter a balance that covers your in-play funds.");
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      const r = await supabase.rpc("update_personal_bankroll", {
        p_account_id: account.id,
        p_balance_cents: cents,
        p_expected_cents: totals.balance,
        p_reason: balanceReason,
      });
      if (r.error) throw r.error;
      await load();
      setEditingBalance(false);
      setNotice(
        "Bankroll updated. Your bet results and starting record are preserved.",
      );
    } catch (e) {
      setNotice(
        (e as { message?: string }).message || "Could not update bankroll.",
      );
      await load();
    } finally {
      setSaving(false);
    }
  }
  const outcomes = entryBalances(
    account ? totals.balance : Math.round(Number(starting) * 100),
    Math.round(Number(stake) * 100),
    Math.round(Number(payout) * 100),
  );
  return (
    <section className="personal-challenge" aria-label="Challenge tracking">
      {renderOfficial?.(current ? entryAction : null)}
      <ChallengeRun challenge={challenge} stages={stages} member />
      {!renderOfficial && current && entryAction}
      <section
        className={`one-bankroll ${totals.inPlay > 0 && account ? "is-in-play" : ""}`}
        aria-label="Your bankroll path"
      >
        <span className="eyebrow">YOUR CHALLENGE · ONE PATH</span>
        {loading ? (
          <p>Loading your bankroll…</p>
        ) : loadError ? (
          <button className="secondary" onClick={() => void load()}>
            Retry loading bankroll
          </button>
        ) : account ? (
          <>
            <div className="balance-hero">
              <div>
                <span>Your bankroll</span>
                <strong>{money(totals.balance)}</strong>
              </div>
              <Badge tone={totals.inPlay ? "green" : "muted"}>
                {totals.inPlay
                  ? "IN PLAY"
                  : entries.length
                    ? "SETTLED"
                    : "READY"}
              </Badge>
            </div>
            <button
              className="secondary bankroll-edit-button"
              onClick={() => {
                setNewBalance((totals.balance / 100).toFixed(2));
                setEditingBalance((v) => !v);
              }}
            >
              Update bankroll
            </button>
            {editingBalance && (
              <form className="bankroll-quick-edit" onSubmit={updateBalance}>
                <label className="field">
                  New total bankroll ($)
                  <input
                    autoFocus
                    type="number"
                    inputMode="decimal"
                    min={totals.inPlay / 100}
                    max="1000000"
                    step="0.01"
                    required
                    value={newBalance}
                    onChange={(e) => setNewBalance(e.target.value)}
                  />
                </label>
                <label className="field">
                  Reason
                  <select
                    aria-label="Adjustment reason"
                    value={balanceReason}
                    onChange={(e) => setBalanceReason(e.target.value)}
                  >
                    <option>Balance correction</option>
                    <option>Deposit</option>
                    <option>Withdrawal</option>
                  </select>
                </label>
                <p>
                  Include {money(totals.inPlay)} already in play. This records a
                  balance adjustment, not a bet result or a sportsbook transfer.
                </p>
                <div>
                  <button className="primary" disabled={saving}>
                    {saving ? "Saving…" : "Save balance"}
                  </button>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => setEditingBalance(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
            <p className="balance-equation">
              {money(account.starting_cents)} starting <span>+</span>{" "}
              {signedMoney(totals.net)} settled P/L{" "}
              {adjustments.length > 0 && (
                <>
                  <span>+</span>{" "}
                  {signedMoney(
                    adjustments.reduce(
                      (sum, a) => sum + Number(a.delta_cents),
                      0,
                    ),
                  )}{" "}
                  adjustments{" "}
                </>
              )}
              <span>=</span> {money(totals.balance)}
            </p>
            <div className="balance-facts">
              <span>
                Available <b>{money(totals.available)}</b>
              </span>
              <span>
                In play <b>{money(totals.inPlay)}</b>
              </span>
              <span>
                Record{" "}
                <b>
                  {totals.wins}W / {totals.losses}L
                </b>
              </span>
            </div>
            {totals.inPlay > 0 ? (
              <div className="balance-next">
                <span>If all open entries win</span>
                <strong>{money(totals.ifWin)}</strong>
                <small>
                  {money(totals.available)} uncommitted + {money(totals.payout)}{" "}
                  total returns. Potential, not settled.
                </small>
              </div>
            ) : (
              <p className="personal-caption">
                {entries.length
                  ? "Your settled balance carries forward. The next entry uses the stake and odds you actually record."
                  : "Starting amount saved. No bets recorded yet."}
              </p>
            )}
            {pick && !ended && !current && (
              <div className="bankroll-entry-action">
                <button
                  className="primary"
                  disabled={loading || loadError}
                  onClick={open}
                >
                  Record my actual entry
                </button>
                <p className="personal-caption">
                  For a wager you already placed. Enter its odds and stake here.
                </p>
              </div>
            )}
            <details className="balance-method">
              <summary>How your balance updates</summary>
              <p>
                Win: add actual profit. Loss: subtract the recorded stake. Push
                or void: return the stake. A passed stage leaves your balance
                unchanged.
              </p>
              <p>
                Funds in play are reserved, not counted as winnings. Future
                stakes and prices are never assumed.
              </p>
            </details>
          </>
        ) : (
          <form className="bankroll-setup" onSubmit={setup}>
            <h2>What’s your starting bankroll?</h2>
            <p>
              The challenge’s starting example is $20. Enter your own amount to
              track one personal balance. This does not place a wager.
            </p>
            <label className="field">
              Starting bankroll ($)
              <input
                name="starting_bankroll"
                type="number"
                inputMode="decimal"
                min="0.01"
                max="1000000"
                step="0.01"
                required
                value={starting}
                onChange={(e) => setStarting(e.target.value)}
              />
            </label>
            <small>
              Check the amount before saving. Your starting record is permanent;
              results update the balance automatically.
            </small>
            <button className="primary" disabled={saving}>
              {saving ? "Saving…" : "Save my starting bankroll"}
            </button>
          </form>
        )}
        {adjustments.length > 0 && (
          <details className="personal-history">
            <summary>Balance adjustments ({adjustments.length})</summary>
            {adjustments.map((a) => (
              <article key={a.id}>
                <strong>
                  {signedMoney(Number(a.delta_cents))} · {a.reason}
                </strong>
                <small>{time(a.created_at)}</small>
              </article>
            ))}
          </details>
        )}
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
                  <EntryCorrection entry={e} onChanged={() => void load()} />
                </article>
              );
            })}
          </details>
        )}
      </section>
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
                value={starting}
                onChange={(e) => setStarting(e.target.value)}
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
              inputMode="text"
              type="text"
              name="odds"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              pattern="[+\-]?[0-9]+([.][0-9]+)?"
              title="Enter American odds with a sign, for example -114 or +120."
              required
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
          {outcomes && payout && stake && (
            <div className="entry-balance-preview" aria-live="polite">
              <h3>Your balance after this entry</h3>
              <p>
                Profit if win: <strong>{money(outcomes.profit)}</strong>
              </p>
              <p>
                Win <strong>{money(outcomes.win)}</strong> · Loss{" "}
                <strong>{money(outcomes.loss)}</strong> · Push / void{" "}
                <strong>{money(outcomes.push)}</strong>
              </p>
              <small>
                Uses your starting/settled balance and this entry only. Other
                open entries remain unsettled.
              </small>
            </div>
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
