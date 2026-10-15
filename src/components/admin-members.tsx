"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { activity, sortMembers, type MemberSort } from "@/lib/member-activity";

type Member = {
  id: string;
  email: string | null;
  username: string | null;
  created_at: string;
  last_active: string | null;
  confirmed: boolean;
  administrator: boolean;
  access_until: string | null;
  friends_pass: boolean;
  tail_count: number;
};
type Summary = { members: number; active_24h: number; active_7d: number; never: number; premium: number };
type Result = { total: number; summary: Summary; accounts: Member[] };

const day = (v: string) =>
  new Date(v).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" });

/** Admin portal on the Account page: every registered member, their last activity, premium, and delete. */
export default function AdminMembers() {
  const [data, setData] = useState<Result | null>(null),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [sort, setSort] = useState<MemberSort>("active"),
    [confirming, setConfirming] = useState<string | null>(null),
    [typed, setTyped] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const r = await supabase.rpc("admin_accounts", { p_search: query, p_page: page });
    if (r.error) {
      setError("Member list unavailable. Complete two-step verification and retry.");
      return;
    }
    setError("");
    setData(r.data as Result);
  }, [query, page]);
  useEffect(() => {
    void load();
  }, [load]);
  function find(e: FormEvent) {
    e.preventDefault();
    setPage(0);
    setQuery(search.trim());
  }
  async function remove(m: Member) {
    setBusy(true);
    setNotice("");
    try {
      const s = await supabase.auth.getSession();
      const r = await fetch("/api/admin/accounts/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${s.data.session?.access_token || ""}`,
        },
        body: JSON.stringify({ user_id: m.id, confirm_email: typed }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(body.error || "The account was not deleted.");
      setConfirming(null);
      setTyped("");
      setNotice(`${m.username ? "@" + m.username : m.email} was deleted.`);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "The account was not deleted.");
    } finally {
      setBusy(false);
    }
  }
  const rows = data ? sortMembers(data.accounts, sort) : [];
  const s = data?.summary;
  return (
    <section className="admin-members" aria-label="Admin portal · Members">
      <header>
        <span className="eyebrow">Admin portal · only you see this</span>
        <h2>Members</h2>
        <nav>
          <Link href="/admin">Publishing desk →</Link>
          <Link href="/admin/accounts">Promos & tail activity →</Link>
        </nav>
      </header>
      {error && <p role="alert">{error}</p>}
      {s && (
        <div className="admin-members-stats">
          <div><b>{s.members}</b><small>Members</small></div>
          <div className="live"><b>{s.active_24h}</b><small>Active today</small></div>
          <div><b>{s.active_7d}</b><small>This week</small></div>
          <div className="never"><b>{s.never}</b><small>Never logged in</small></div>
          <div className="gold"><b>{s.premium}</b><small>Premium</small></div>
        </div>
      )}
      <form className="admin-members-tools" onSubmit={find}>
        <input
          type="search"
          aria-label="Search members by email or username"
          placeholder="Search email or @username"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select aria-label="Sort members" value={sort} onChange={(e) => setSort(e.target.value as MemberSort)}>
          <option value="active">Most recently active</option>
          <option value="idle">Least active first</option>
          <option value="newest">Newest sign-ups</option>
        </select>
      </form>
      {notice && <p role="status" className="admin-members-notice">{notice}</p>}
      <ul className="admin-members-list">
        {rows.map((m) => {
          const a = activity(m.last_active);
          return (
            <li key={m.id}>
              <div className="admin-member-head">
                <span>
                  <b>{m.username ? `@${m.username}` : "No profile yet"}</b>
                  <small>{m.email}</small>
                </span>
                <em className={`tone-${a.tone}`}>{a.label}</em>
              </div>
              <p className="admin-member-facts">
                Joined {day(m.created_at)} ·{" "}
                {m.access_until ? `Premium until ${day(m.access_until)}` : "No premium"} ·{" "}
                {m.tail_count} tailed
                {!m.confirmed && " · Email unconfirmed"}
                {m.friends_pass && " · Friends pass"}
                {m.administrator && " · Administrator"}
              </p>
              {!m.administrator &&
                (confirming === m.id ? (
                  <div className="admin-member-delete">
                    <label>
                      Type <b>{m.email}</b> to delete this account permanently
                      <input
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                      />
                    </label>
                    <div>
                      <button
                        type="button"
                        className="danger"
                        disabled={busy || typed.trim().toLowerCase() !== (m.email || "").toLowerCase()}
                        onClick={() => void remove(m)}
                      >
                        {busy ? "Deleting…" : "Delete account"}
                      </button>
                      <button type="button" className="text-link" onClick={() => { setConfirming(null); setTyped(""); }}>
                        Cancel
                      </button>
                    </div>
                    <small>Cancels any subscription, removes their photos, picks and profile, and signs them out everywhere. This can’t be undone.</small>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="text-link admin-member-remove"
                    onClick={() => { setConfirming(m.id); setTyped(""); setNotice(""); }}
                  >
                    Delete account
                  </button>
                ))}
            </li>
          );
        })}
      </ul>
      {data && (data.total > (page + 1) * 50 || page > 0) && (
        <div className="admin-members-pages">
          <button type="button" className="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>← Newer</button>
          <span>Page {page + 1} of {Math.ceil(data.total / 50)}</span>
          <button type="button" className="secondary" disabled={(page + 1) * 50 >= data.total} onClick={() => setPage(page + 1)}>Older →</button>
        </div>
      )}
      <p className="admin-members-note">
        “Active” counts any use of the app, including staying signed in, not just fresh logins.
      </p>
    </section>
  );
}
