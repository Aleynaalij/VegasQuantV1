import Link from "next/link";
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
  sport: requested = "nfl",
}: {
  children: ReactNode;
  active?: string;
  sport?: Sport;
}) {
  // A sport that isn't live yet wears the NFL chrome.
  const sport = SPORTS[requested]?.live ? requested : "nfl";
  const home = SPORTS[sport].home;
  const community =
    sport === "nfl" ? "/community" : `/community?sport=${sport}`;
  const feed = "/slots";
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
            aria-current={active === "slots" ? "page" : undefined}
            className={`feed-nav-link ${active === "slots" ? "active" : ""}`}
            href={feed}
          >
            <span className="vq-slots-nav-icon" aria-hidden="true">
              ♦<i />
            </span>
            VQ Slots
          </Link>
          <Link
            aria-current={active === "community" ? "page" : undefined}
            className={active === "community" ? "active" : ""}
            href={community}
          >
            <Users size={19} />
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
        {!(sport === "nba" && active === "home") && (
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
          <Link href={home} className="mobile-brand">
            <BrandMark />
            VEGAS QUANT
          </Link>
          <div className="breadcrumb">
            Vegas Quant <span>/</span>{" "}
            <b>
              {(
                {
                  home:
                    sport === "nfl"
                      ? "Sports desk"
                      : `${SPORTS[sport].label} desk`,
                  game: "The Zone",
                  community: "The Zone",
                  slots: "VQ Slots",
                  feed: "The Zone",
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
          {liveSports().map((key) => {
            const chip = (
              <Link
                key={key}
                href={chipHref(key)}
                aria-current={sport === key ? "page" : undefined}
                aria-label={SPORTS[key].name}
                className={sport === key ? "selected" : ""}
                data-sport={key}
              >
                {SPORTS[key].label}
              </Link>
            );
            // Frank's surprise is NHL itself: its chip waits for his invitation status.
            return key === "nhl" && sport !== "nhl" ? (
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
        <main id="main-content" tabIndex={-1}>
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
            aria-current={active === "slots" ? "page" : undefined}
            className={`feed-nav-link ${active === "slots" ? "active" : ""}`}
            href={feed}
          >
            <span className="vq-slots-nav-icon" aria-hidden="true">
              ♦<i />
            </span>
            VQ Slots
          </Link>
          <Link
            aria-current={active === "community" ? "page" : undefined}
            className={active === "community" ? "active" : ""}
            href={community}
          >
            <Users size={19} />
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
