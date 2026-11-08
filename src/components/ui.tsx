import Link from "next/link";
import "@/app/sports-switcher.css";
import "@/app/zone-focus.css";
import BrandMark from "./brand-mark";
import InstallApp from "./install-app";
import { NotificationBell as UpdateInbox } from "./notification-provider";
import LetsSweat from "./lets-sweat";
import AccountLink from "./account-link";
import SwipeTabs from "./swipe-tabs";
import TabScrub from "./tab-scrub";
import CommunityStories from "./community-stories";
import AdminOnly from "./admin-only";
import FrankAnniversaryGate, { NhlChipHold } from "./frank-anniversary-gate";
import FrankNhlFeedback from "./frank-nhl-feedback";
import { liveSports, SPORTS, type Sport } from "@/lib/sports";
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
  sport: requested,
}: {
  children: ReactNode;
  active?: string;
  sport?: Sport;
}) {
  // Only a page that names its (live) sport selects that chip and shows its sport-only card;
  // pages without one (the lobby, The Zone across sports, lays, profiles) select no sport.
  // Their links still default to the NFL chrome.
  const pageSport =
    requested && SPORTS[requested]?.live ? requested : undefined;
  const sport = pageSport ?? "nfl";
  // The neutral lobby (/) belongs to no sport: no chip is selected and no sport-only claims show.
  const lobby = active === "lobby";
  const home = SPORTS[sport].home;
  const community =
    sport === "nfl" ? "/community" : `/community?sport=${sport}`;
  const records =
    sport === "nfl" ? "/history" : `${SPORTS[sport].home}/records`;
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
      home: SPORTS.nfl.home,
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
  // Each sport's chip keeps you in the same section where that sport has one.
  const chipHref = (key: Sport) =>
    key === "nfl"
      ? nflHref
      : key === "nba"
        ? nbaHref
        : sportSection === "community"
          ? `/community?sport=${key}`
          : ["history", "performance"].includes(sportSection)
            ? `${SPORTS[key].home}/records`
            : SPORTS[key].home;
  return (
    <div className={`shell screen-${active}`}>
      <SwipeTabs />
      <FrankAnniversaryGate />
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
            <small>SPORTS INTELLIGENCE</small>
          </span>
        </Link>
        <span className="nav-label">YOUR RESEARCH DESK</span>
        <nav aria-label="Main navigation">
          <Link
            aria-current={lobby ? "page" : undefined}
            className={lobby ? "active" : ""}
            href="/"
          >
            <LayoutDashboard size={18} />
            Home
          </Link>
          <Link
            aria-current={active === "community" ? "page" : undefined}
            className={`vq-zone-nav ${active === "community" ? "active" : ""}`}
            href={community}
          >
            <span className="vq-zone-nav-icon" aria-hidden="true">
              <Users size={19} />
              <i />
            </span>
            The Zone
          </Link>
          <AdminOnly>
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
          </AdminOnly>
          <Link
            className={active === "account" ? "active" : ""}
            aria-current={active === "account" ? "page" : undefined}
            href="/membership"
          >
            <LockKeyhole size={18} />
            Account
          </Link>
        </nav>
        {pageSport && !(pageSport === "nba" && active === "home") && (
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
        )}
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
                  lobby: "Home",
                  lays: "Your lays",
                  // A page without a sport (lays, profiles) is not any one sport's desk.
                  home: pageSport
                    ? `${SPORTS[pageSport].label} desk`
                    : "Sports desk",
                  game: `${SPORTS[sport].label} games`,
                  community: "The Zone",
                  slots: "VQ Slots",
                  feed: "Published research",
                  history: "Records",
                  performance: "Performance",
                  account: "Account",
                  admin: "Publishing",
                  intelligence: "Data Intelligence",
                  methodology: "Methodology",
                  nbaresearch: "NBA research",
                  error: "Something went wrong",
                  missing: "Not found",
                  rules: "Rulebook",
                } as Record<string, string>
              )[active] || "Workspace"}
            </b>
          </div>
          <div className="top-actions">
            {sport === "nfl" && !lobby && active !== "community" && (
              <LetsSweat />
            )}
            <InstallApp />
            <UpdateInbox />
            <span className="desktop">Research desk</span>
            <AccountLink />
          </div>
        </header>
        {!lobby && (
          <nav
            className="sport-switch sports-rail"
            aria-label="Sport selection"
            data-swipe-tabs
          >
            {liveSports().map((key) => {
              const chip = (
                <Link
                  key={key}
                  href={chipHref(key)}
                  aria-current={pageSport === key ? "page" : undefined}
                  aria-label={SPORTS[key].name}
                  className={pageSport === key ? "selected" : ""}
                  data-sport={key}
                >
                  <svg
                    className="sports-rail-icon"
                    viewBox="0 0 32 32"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    {key === "nfl" ? (
                      <g transform="rotate(38 16 16)">
                        <ellipse cx="16" cy="16" rx="8" ry="13" />
                        <path d="M16 9v14M12 12h8M12 16h8M12 20h8" />
                      </g>
                    ) : key === "nhl" ? (
                      <>
                        <path d="m25 4-13 20H4v4h10L28 6" />
                        <ellipse cx="25" cy="27" rx="4" ry="2" />
                      </>
                    ) : (
                      <>
                        <circle cx="16" cy="16" r="13" />
                        <path d="M3 16h26M16 3v26M7 6c12 6 12 14 0 20M25 6c-12 6-12 14 0 20" />
                      </>
                    )}
                  </svg>
                  {SPORTS[key].label}
                </Link>
              );
              // Frank's surprise is NHL itself: its chip waits for his invitation status.
              return key === "nhl" && pageSport !== "nhl" ? (
                <NhlChipHold key={key}>{chip}</NhlChipHold>
              ) : (
                chip
              );
            })}
            {active === "home" || active === "community" ? (
              <CommunityStories />
            ) : sport === "nba" ? (
              <span>{active === "feed" ? "Legs we like" : "NBA research"}</span>
            ) : null}
          </nav>
        )}
        <main id="main-content" tabIndex={-1}>
          {lobby || active === "home" ? <FrankNhlFeedback /> : null}
          {children}
          <footer className="vq-footer">
            <p>
              <ShieldCheck size={14} aria-hidden="true" />
              <span>
                <b>Process over outcome.</b>{" "}
                {sport === "nfl"
                  ? "Sports research and community, not a sportsbook. No wager or profit is guaranteed."
                  : `Research, not a sportsbook or a guarantee: ${SPORTS[sport].label} selections publish only after the data is verified, and a pass is a valid decision.`}{" "}
                {sport === "ncaab"
                  ? "Some states restrict wagering on in-state college teams. "
                  : ""}
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
            <p>
              Vegas Quant is an independent sports analytics platform and is not
              affiliated with, sponsored by, or endorsed by any league, team, or
              player. Third-party trademarks belong to their respective owners.
            </p>
            <small>
              © {new Date().getFullYear()} JourneyBuilt, LLC. Vegas Quant is a
              product of JourneyBuilt, LLC.
            </small>
          </footer>
        </main>
        <nav className="mobile-nav" aria-label="Main navigation">
          <TabScrub />
          <Link
            aria-current={lobby ? "page" : undefined}
            className={lobby ? "active" : ""}
            href="/"
          >
            <LayoutDashboard size={19} />
            Home
          </Link>
          <Link
            aria-current={active === "community" ? "page" : undefined}
            className={`vq-zone-nav ${active === "community" ? "active" : ""}`}
            href={community}
          >
            <span className="vq-zone-nav-icon" aria-hidden="true">
              <Users size={19} />
              <i />
            </span>
            The Zone
          </Link>
          <AdminOnly>
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
          </AdminOnly>
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
