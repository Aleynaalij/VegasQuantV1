import Link from "next/link";
import AccountLink from "./account-link";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  History,
  LayoutDashboard,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Panel({
  title,
  aside,
  children,
  className = "",
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <h2>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-symbol">
        <BookOpen size={24} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Stat({
  label,
  value,
  note,
  tone = "",
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: string;
}) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}
export function Shell({
  children,
  active = "home",
}: {
  children: ReactNode;
  active?: string;
}) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="logo">
            <Activity size={26} />
          </span>
          <span>
            VEGAS <b>QUANT</b>
            <small>THE RESEARCH DESK</small>
          </span>
        </Link>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          <Link className={active === "home" ? "active" : ""} href="/">
            <LayoutDashboard size={18} />
            The challenge
          </Link>
          <Link
            className={active === "game" ? "active" : ""}
            href="/games/steelers-browns-2026-10-01"
          >
            <BookOpen size={18} />
            Matchup desk
          </Link>
          <Link
            className={
              ["history", "performance"].includes(active) ? "active" : ""
            }
            href="/history"
          >
            <History size={18} />
            Permanent ledger
          </Link>
          <Link
            className={active === "performance" ? "active" : ""}
            href="/performance"
          >
            <Activity size={18} />
            Performance
          </Link>
        </nav>
        <div className="sidebar-rule">
          <ShieldCheck size={23} />
          <h3>Discipline is the edge.</h3>
          <p>
            Research first. Price second.
            <br />A pass is a valid decision.
          </p>
          <div>
            <span>MINIMUM EDGE</span>
            <strong>
              3.0<small>%</small>
            </strong>
          </div>
        </div>
        <div className="sidebar-bottom">
          <span className="avatar">VQ</span>
          <span>
            Vegas Quant Ultra<small>Analyst of record</small>
          </span>
          <i />
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <Link href="/" className="mobile-brand">
            <Activity size={21} />
            VEGAS QUANT
          </Link>
          <div className="breadcrumb">
            Workspace <span>/</span> <b>The 5-Spot Challenge</b>
          </div>
          <div className="top-actions">
            <span className="live-dot" />{" "}
            <span className="desktop">Research & execution</span>
            <AccountLink />
          </div>
        </header>
        <main>
          {children}
          <footer>
            <span>
              <ShieldCheck size={14} />
              Process over outcome.
            </span>
            <p>
              Entertainment challenge. No wager is guaranteed. A stage may be
              passed when no qualifying edge exists.
            </p>
            <span>VEGAS QUANT / V1</span>
          </footer>
        </main>
        <nav className="mobile-nav">
          <Link className={active === "home" ? "active" : ""} href="/">
            <LayoutDashboard size={19} />
            Challenge
          </Link>
          <Link
            className={active === "game" ? "active" : ""}
            href="/games/steelers-browns-2026-10-01"
          >
            <BookOpen size={19} />
            Matchup
          </Link>
          <Link
            className={
              ["history", "performance"].includes(active) ? "active" : ""
            }
            href="/history"
          >
            <History size={19} />
            Ledger
          </Link>
          <Link
            className={active === "account" ? "active" : ""}
            href="/membership"
          >
            <LockKeyhole size={19} />
            Account
          </Link>
        </nav>
      </div>
    </div>
  );
}
export function SourceLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return /^https?:\/\//.test(href) ? (
    <a className="source-link" href={href} target="_blank" rel="noreferrer">
      {children}
      <ArrowUpRight size={13} />
    </a>
  ) : (
    <span className="muted">{href}</span>
  );
}
