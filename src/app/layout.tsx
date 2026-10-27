import "./ruby.css";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./base.css";
import "./shell.css";
import "./home.css";
import "./game-picks.css";
import "./picks.css";
import "./research.css";
import "./admin.css";
import "./zone.css";
import "./records.css";
import "./games.css";
import "./community.css";
import "./account.css";
import "./age-verification.css";
import "./nba.css";
import "./dark-surfaces.css";
import "./premium.css";
import "./lounge.css";
import "./social.css";
import "./notifications.css";
import NotificationProvider from "@/components/notification-provider";
import "./parlay-builder.css";
import "./performance.css";
import NotificationBootstrap from "@/components/notification-bootstrap";
import ProfileSetupGate from "@/components/profile-setup-gate";
import PhoneContactPrompt from "@/components/phone-contact-prompt";
import Welcome from "@/components/welcome";
import ThemePrompt from "@/components/theme-settings";
import DailyLuck from "@/components/daily-luck";
import AppRefreshNotice from "@/components/app-refresh-notice";
import BrandOpening from "@/components/brand-opening";
import AgeAccessBoundary from "@/components/age-access-boundary";

// Self-hosted from the repo (latin subset, SIL OFL; licenses in ./fonts) and preloaded, so builds
// never fetch Google Fonts.
const body = localFont({
  src: [{ path: "./fonts/dm-sans-latin.woff2", weight: "400 700" }],
  display: "swap",
  variable: "--font-body",
  fallback: ["Arial", "sans-serif"],
});
const display = localFont({
  src: [{ path: "./fonts/manrope-latin.woff2", weight: "400 800" }],
  display: "swap",
  variable: "--font-display",
  fallback: ["Arial", "sans-serif"],
});
// Sportsbook-board numerals and headings for the lounge theme.
const board = localFont({
  src: [
    { path: "./fonts/barlow-condensed-600-latin.woff2", weight: "600" },
    { path: "./fonts/barlow-condensed-700-latin.woff2", weight: "700" },
    { path: "./fonts/barlow-condensed-800-latin.woff2", weight: "800" },
  ],
  display: "swap",
  variable: "--font-board",
  fallback: ["Arial Narrow", "sans-serif"],
});
export const metadata: Metadata = {
  applicationName: "Vegas Quant",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Vegas Quant",
  },
  icons: { apple: "/icons/vq-lounge-apple.png" },
  title: "Vegas Quant | Sports Intelligence",
  description:
    "NFL research, live scores and transparent picks. Find the play. Understand the case. Keep the record.",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#07080b",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${body.variable} ${display.variable} ${board.variable}`}
      data-theme="dark"
      style={{ colorScheme: "dark" }}
      suppressHydrationWarning
    >
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{localStorage.removeItem('vq-theme-v1');localStorage.removeItem('vq-theme-v2')}catch(e){}",
          }}
        />
        <BrandOpening />
        <ThemePrompt />
        <NotificationProvider>
          <AgeAccessBoundary
            extras={
              <>
                <AppRefreshNotice />
                <Welcome />
                <ProfileSetupGate />
                <NotificationBootstrap />
                <PhoneContactPrompt />
                <DailyLuck />
              </>
            }
          >
            {children}
          </AgeAccessBoundary>
        </NotificationProvider>
      </body>
    </html>
  );
}
