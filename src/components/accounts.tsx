"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import AdminCorrections from "./admin-corrections";
import AccountTails from "./account-tails";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Panel, Shell } from "./ui";
type Account = {
  tail_count: number;
  open_tail_count: number;
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  confirmed: boolean;
  administrator: boolean;
  access_until: string | null;
  friends_pass: boolean;
};
type Promo = {
  label: string;
  code: string;
  used: number;
  limit: number;
  expires_at: string;
  active: boolean;
};
type Result = { total: number; accounts: Account[]; promos: Promo[] };
const date = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("en-US", { timeZone: "America/New_York" })
    : "—";
export default function Accounts() {
  const generation = useRef(0);
  const [data, setData] = useState<Result | null>(null),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(true);
  const load = useCallback(async () => {
    const run = ++generation.current;
    setBusy(true);
    setNotice("");
    const r = await supabase.rpc("admin_accounts", {
      p_search: query,
      p_page: page,
    });
    if (run !== generation.current) return;
    if (r.error) {
      setData(null);
      setNotice(
        "Sign in and verify your administrator account to view accounts.",
      );
    } else setData(r.data as Result);
    setBusy(false);
  }, [query, page]);
  useEffect(() => {
    let active = true;
    void load();
    const { data: auth } = supabase.auth.onAuthStateChange(() => {
      generation.current++;
      setData(null);
      setTimeout(() => {
        if (active) void load();
      }, 0);
    });
    return () => {
      active = false;
      generation.current++;
      auth.subscription.unsubscribe();
    };
  }, [load]);
  function find(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPage(0);
    setQuery(search.trim());
  }
  return (
    <Shell active="account">
      <div className="heading">
        <div>
          <div className="eyebrow">PRIVATE ADMIN TOOLS</div>
          <h1>Accounts & friends passes</h1>
          <p>
            Registered accounts, access status, and your limited friends offer.
          </p>
        </div>
      </div>
      <p>
        <Link className="text-link" href="/admin">
          Publishing desk
        </Link>{" "}
        ·{" "}
        <Link className="text-link" href="/membership">
          Your account
        </Link>
      </p>
      {notice && <p role="status">{notice}</p>}
      {!data ? (
        <Panel
          title={
            busy
              ? "Checking admin access…"
              : "Administrator verification required"
          }
        >
          <div className="notebook">
            <Link className="primary" href="/membership">
              Sign in / verify
            </Link>
          </div>
        </Panel>
      ) : (
        <>
          <AdminCorrections />
          <Panel title="Friends · full season">
            <div className="notebook">
              {data.promos.map((p) => (
                <div key={p.code}>
                  <h3>{p.label}</h3>
                  <p>
                    <b>
                      {p.used} / {p.limit} redeemed
                    </b>{" "}
                    · {p.active ? "Available" : "Closed"}
                  </p>
                  <label style={{ display: "grid", gap: 8 }}>
                    Private promo code
                    <input
                      readOnly
                      value={p.code}
                      aria-label="Friends promo code"
                      style={{
                        width: "100%",
                        maxWidth: 420,
                        padding: 12,
                        boxSizing: "border-box",
                        color: "inherit",
                        background: "#10191e",
                        border: "1px solid #42534e",
                        borderRadius: 8,
                      }}
                    />
                  </label>
                  <button
                    className="secondary"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(p.code);
                        setNotice("Friends code copied.");
                      } catch {
                        setNotice("Select and copy the code manually.");
                      }
                    }}
                  >
                    Copy code
                  </button>
                  <p>
                    Access through {date(p.expires_at)} ET. Share privately.
                    Each confirmed account can redeem once; the code closes
                    after {p.limit} successful redemptions.
                  </p>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title={"Registered accounts (" + data.total + ")"}>
            <div className="notebook">
              <form className="member-form" onSubmit={find}>
                <label>
                  Search email
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    maxLength={120}
                    type="search"
                  />
                </label>
                <button className="secondary" disabled={busy}>
                  Search
                </button>
              </form>
              <button
                className="research-more"
                disabled={busy}
                onClick={() => void load()}
              >
                Refresh accounts
              </button>
              {data.accounts.length === 0 && <p>No accounts match.</p>}
              <div style={{ display: "grid", gap: 12 }}>
                {data.accounts.map((a) => (
                  <article
                    key={a.id}
                    style={{
                      padding: 16,
                      border: "1px solid #293b42",
                      borderRadius: 12,
                      overflowWrap: "anywhere",
                    }}
                  >
                    <h3>{a.email || "No email"}</h3>
                    <p>
                      {a.administrator
                        ? "Administrator"
                        : a.access_until
                          ? "Active member"
                          : "No active pass"}
                      {a.friends_pass ? " · Friends pass" : ""} ·{" "}
                      {a.confirmed ? "Email confirmed" : "Email not confirmed"}
                    </p>
                    <p>
                      Joined: {date(a.created_at)} ET
                      <br />
                      Last sign-in: {date(a.last_sign_in_at)}
                      {a.last_sign_in_at ? " ET" : ""}
                      {a.access_until && (
                        <>
                          <br />
                          Access ends: {date(a.access_until)} ET
                        </>
                      )}
                    </p>
                    <AccountTails
                      userId={a.id}
                      count={a.tail_count ?? 0}
                      openCount={a.open_tail_count ?? 0}
                    />
                  </article>
                ))}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 16,
                  alignItems: "center",
                  marginTop: 20,
                }}
              >
                <button
                  className="secondary"
                  disabled={busy || page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <span>Page {page + 1}</span>
                <button
                  className="secondary"
                  disabled={busy || (page + 1) * 50 >= data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </Panel>
        </>
      )}
    </Shell>
  );
}
