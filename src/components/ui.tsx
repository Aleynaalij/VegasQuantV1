import Link from "next/link";
import BrandMark from "./brand-mark";
import InstallApp from "./install-app";
import AccountLink from "./account-link";
import {
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
    <div className={`shell screen-${active}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="logo">
            <BrandMark />
          </span>
          <span>
            VEGAS <b>QUANT</b>
            <small>RESEARCH. DECISIONS. PROGRESS.</small>
          </span>
        </Link>
        <span className="nav-label">YOUR PLAYBOOK</span>
        <nav aria-label="Main navigation">
          <Link
            aria-current={active === "home" ? "page" : undefined}
            className={active === "home" ? "active" : ""}
            href="/"
          >
            <LayoutDashboard size={18} />
            Home
          </Link>
          <Link
            aria-current={active === "game" ? "page" : undefined}
            className={active === "game" ? "active" : ""}
            href="/matchups"
          >
            <BookOpen size={18} />
            Matchups
          </Link>
          <Link
            aria-current={active === "feed" ? "page" : undefined}
            className={`feed-nav-link ${active === "feed" ? "active" : ""}`}
            href="/feed"
          >
            <BrandMark />
            Feed
          </Link>
          <Link
            className={
              ["history", "performance"].includes(active) ? "active" : ""
            }
            aria-current={
              ["history", "performance"].includes(active) ? "page" : undefined
            }
            href="/history"
          >
            <History size={18} />
            Records
          </Link>
          <Link
            className={active === "account" ? "active" : ""}
            aria-current={active === "account" ? "page" : undefined}
            href="/membership"
          >
            <LockKeyhole size={18} />
            Account
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
          <span className="avatar">
            <BrandMark />
          </span>
          <span>
            Vegas Quant Ultra<small>Analyst of record</small>
          </span>
          <i />
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <Link href="/" className="mobile-brand">
            <BrandMark />
            VEGAS QUANT
          </Link>
          <div className="breadcrumb">
            Vegas Quant <span>/</span>{" "}
            <b>
              {(
                {
                  home: "Home",
                  game: "Matchup",
                  feed: "The Feed",
                  history: "Records",
                  performance: "Performance",
                  account: "Account",
                  admin: "Publishing",
                  intelligence: "Data Intelligence",
                } as Record<string, string>
              )[active] || "Workspace"}
            </b>
          </div>
          <div className="top-actions">
            <InstallApp />
            <span className="desktop">Research desk</span>
            <AccountLink />
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
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
            <Link href="/methodology">Methodology & transparency</Link>
          </footer>
        </main>
        <nav className="mobile-nav" aria-label="Main navigation">
          <Link
            aria-current={active === "home" ? "page" : undefined}
            className={active === "home" ? "active" : ""}
            href="/"
          >
            <LayoutDashboard size={19} />
            Home
          </Link>
          <Link
            aria-current={active === "game" ? "page" : undefined}
            className={active === "game" ? "active" : ""}
            href="/matchups"
          >
            <BookOpen size={19} />
            Matchup
          </Link>
          <Link
            aria-current={active === "feed" ? "page" : undefined}
            className={`feed-nav-link ${active === "feed" ? "active" : ""}`}
            href="/feed"
          >
            <BrandMark />
            Feed
          </Link>
          <Link
            className={
              ["history", "performance"].includes(active) ? "active" : ""
            }
            aria-current={
              ["history", "performance"].includes(active) ? "page" : undefined
            }
            href="/history"
          >
            <History size={19} />
            Records
          </Link>
          <Link
            className={active === "account" ? "active" : ""}
            aria-current={active === "account" ? "page" : undefined}
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
