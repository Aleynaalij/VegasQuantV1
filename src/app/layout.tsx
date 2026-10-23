import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, DM_Sans, Manrope } from "next/font/google";
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
import BetaAccessBoundary from "@/components/beta-access-boundary";

// Self-hosted at build time and preloaded (replaces the render-blocking Google Fonts @import).
const body = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-body",
});
const display = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-display",
});
// Sportsbook-board numerals and headings for the lounge theme.
const board = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
  variable: "--font-board",
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
          <AgeAccessBoundary>
            <BetaAccessBoundary
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
            </BetaAccessBoundary>
          </AgeAccessBoundary>
        </NotificationProvider>
      </body>
    </html>
  );
}
