import type { Metadata, Viewport } from "next";
import "./globals.css";
import "@/components/ask-vegas.css";
import "./experience.css";
import "./sports-light.css";
import "./master.css";
import "./zone.css";
import "./records.css";
import "./games.css";
import "./community.css";
import "./account.css";
import "./age-verification.css";
import "./nba.css";
import "./dark-surfaces.css";
import "./premium.css";
import NotificationBootstrap from "@/components/notification-bootstrap";
import ProfileSetupGate from "@/components/profile-setup-gate";
import PhoneContactPrompt from "@/components/phone-contact-prompt";
import Welcome from "@/components/welcome";
import ThemePrompt from "@/components/theme-settings";
import BrandOpening from "@/components/brand-opening";
import AskVegas from "@/components/ask-vegas";
import AgeAccessBoundary from "@/components/age-access-boundary";
export const metadata: Metadata = {
  applicationName: "Vegas Quant",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Vegas Quant",
  },
  icons: { apple: "/icons/vq-prestige-apple.png" },
  title: "Vegas Quant | Sports Intelligence",
  description:
    "NFL research, live scores and transparent picks. Find the play. Understand the case. Keep the record.",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#070b14",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
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
        <ThemePrompt />
        <BrandOpening />
        <AgeAccessBoundary
          extras={
            <>
              <Welcome />
              <ProfileSetupGate />
              <NotificationBootstrap />
              <PhoneContactPrompt />
              <AskVegas />
            </>
          }
        >
          {children}
        </AgeAccessBoundary>
      </body>
    </html>
  );
}
