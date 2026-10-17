import Link from "next/link";
import BrandMark from "./brand-mark";
import InstallApp from "./install-app";
import { NotificationBell as UpdateInbox } from "./notification-provider";
import LetsSweat from "./lets-sweat";
import AccountLink from "./account-link";
import SwipeTabs from "./swipe-tabs";
import TabScrub from "./tab-scrub";
import CommunityStories from "./community-stories";
import {
  ArrowUpRight,
  BookOpen,
  Users,
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
  id,
  title,
  aside,
  children,
  className = "",
}: {
  id?: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`panel ${className}`}>
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
  sport = "nfl",
}: {
  children: ReactNode;
  active?: string;
  sport?: "nfl" | "nba";
}) {
  const home = sport === "nba" ? "/nba" : "/";
  const community = sport === "nba" ? "/community?sport=nba" : "/community";
  const feed = sport === "nba" ? "/nba/zone" : "/feed";
  const records = sport === "nba" ? "/nba/records" : "/history";
  const sportSection = [
    "game",
    "feed",
    "history",
    "performance",
    "community",
  ].includes(active)
    ? active
    : "home";
  const nflHref = (
    {
      community: "/community",
      home: "/",
      game: "/matchups",
      feed: "/feed",
      history: "/history",
      performance: "/history",
    } as Record<string, string>
  )[sportSection];
  const nbaHref = (
    {
      community: "/community?sport=nba",
      home: "/nba",
      game: "/nba/analysis",
      feed: "/nba/zone",
      history: "/nba/records",
      performance: "/nba/records",
    } as Record<string, string>
  )[sportSection];
  return (
    <div className={`shell screen-${active}`}>
      <SwipeTabs />
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link className="brand" href={home}>
          <span className="logo">
            <BrandMark />
          </span>
          <span>
            VEGAS <b>QUANT</b>
            <small>SPORTS INTELLIGENCE</small>
          </span>
        </Link>
        <span className="nav-label">YOUR RESEARCH DESK</span>
        <nav aria-label="Main navigation">
          <Link
            aria-current={active === "home" ? "page" : undefined}
            className={active === "home" ? "active" : ""}
            href={home}
          >
            <LayoutDashboard size={18} />
            Home
          </Link>
          <Link
            aria-current={
              ["feed", "game"].includes(active) ? "page" : undefined
            }
            className={`feed-nav-link ${["feed", "game"].includes(active) ? "active" : ""}`}
            href={feed}
          >
            <BrandMark />
            The Zone
          </Link>
          <Link
            aria-current={active === "community" ? "page" : undefined}
            className={active === "community" ? "active" : ""}
            href={community}
          >
            <Users size={19} />
            Community
          </Link>
          <Link
            className={
              ["history", "performance"].includes(active) ? "active" : ""
            }
            aria-current={
              ["history", "performance"].includes(active) ? "page" : undefined
            }
            href={records}
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
          <h3>
            {sport === "nba" ? "Build the foundation." : "Know your number."}
          </h3>
          <p>
            {sport === "nba" ? (
              <>
                Minutes, role and opportunity before selections.
                <br />
                <Link href="/nba/rules">Read the rulebook →</Link>
              </>
            ) : (
              <>
                A clear case. A verified price.
                <br />A pass is a valid decision.
              </>
            )}
          </p>
          {sport === "nfl" ? (
            <div>
              <span>MINIMUM EDGE</span>
              <strong>
                3.0<small>%</small>
              </strong>
            </div>
          ) : null}
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
          <Link href={home} className="mobile-brand">
            <BrandMark />
            VEGAS QUANT
          </Link>
          <div className="breadcrumb">
            Vegas Quant <span>/</span>{" "}
            <b>
              {(
                {
                  home: sport === "nba" ? "NBA desk" : "Sports desk",
                  game: "The Zone",
                  community: "Community",
                  feed: "The Zone",
                  history: "Records",
                  performance: "Performance",
                  account: "Account",
                  admin: "Publishing",
                  intelligence: "Data Intelligence",
                  methodology: "Methodology",
                  error: "Something went wrong",
                  missing: "Not found",
                  rules: "Rulebook",
                } as Record<string, string>
              )[active] || "Workspace"}
            </b>
          </div>
          <div className="top-actions">
            {sport === "nfl" && <LetsSweat />}
            <InstallApp />
            <UpdateInbox />
            <span className="desktop">Research desk</span>
            <AccountLink />
          </div>
        </header>
        <nav
          className="sport-switch"
          aria-label="Sport selection"
          data-swipe-tabs
        >
          <Link
            href={nflHref}
            aria-current={sport === "nfl" ? "page" : undefined}
            className={sport === "nfl" ? "selected" : ""}
          >
            NFL
          </Link>
          <Link
            href={nbaHref}
            aria-current={sport === "nba" ? "page" : undefined}
            className={sport === "nba" ? "selected" : ""}
          >
            NBA
          </Link>
          {active === "home" ? (
            <CommunityStories />
          ) : sport === "nba" ? (
            <span>Preparation mode</span>
          ) : null}
        </nav>
        <main id="main-content" tabIndex={-1}>
          {children}
          <footer className="vq-footer">
            <p>
              <ShieldCheck size={14} aria-hidden="true" />
              <span>
                <b>Process over outcome.</b>{" "}
                {sport === "nba"
                  ? "Research, not a sportsbook or a guarantee: NBA selections publish only after the data is verified, and a pass is a valid decision."
                  : "Sports research and community, not a sportsbook. No wager or profit is guaranteed."}{" "}
                21+.
              </span>
            </p>
            <nav className="vq-footer-links" aria-label="Help and legal">
              <Link href="/methodology">Methodology</Link>
              <Link href="/about">About</Link>
              <Link href="/faq">FAQs</Link>
              <Link href="/support">Support</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/responsible-play">Responsible play</Link>
            </nav>
            <small>
              © {new Date().getFullYear()} JourneyBuilt, LLC. Vegas Quant is a
              product of JourneyBuilt, LLC.
            </small>
          </footer>
        </main>
        <nav className="mobile-nav" aria-label="Main navigation">
          <TabScrub />
          <Link
            aria-current={active === "home" ? "page" : undefined}
            className={active === "home" ? "active" : ""}
            href={home}
          >
            <LayoutDashboard size={19} />
            Home
          </Link>
          <Link
            aria-current={
              ["feed", "game"].includes(active) ? "page" : undefined
            }
            className={`feed-nav-link ${["feed", "game"].includes(active) ? "active" : ""}`}
            href={feed}
          >
            <BrandMark />
            The Zone
          </Link>
          <Link
            aria-current={active === "community" ? "page" : undefined}
            className={active === "community" ? "active" : ""}
            href={community}
          >
            <Users size={19} />
            Community
          </Link>
          <Link
            className={
              ["history", "performance"].includes(active) ? "active" : ""
            }
            aria-current={
              ["history", "performance"].includes(active) ? "page" : undefined
            }
            href={records}
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
