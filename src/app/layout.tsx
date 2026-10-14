import type { Metadata, Viewport } from "next";
import "./globals.css";
import "@/components/ask-vegas.css";
import "./experience.css";
import "./sports-light.css";
import "./master.css";
import "./zone.css";
import "./nba.css";
import "./dark-surfaces.css";
import "./premium.css";
import NotificationBootstrap from "@/components/notification-bootstrap";
import ProfileSetupGate from "@/components/profile-setup-gate";
import PhoneContactPrompt from "@/components/phone-contact-prompt";
import Welcome from "@/components/welcome";
import ThemePrompt from "@/components/theme-settings";
import AskVegas from "@/components/ask-vegas";
export const metadata: Metadata = {
  applicationName: "Vegas Quant",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Vegas Quant",
  },
  icons: { apple: "/icons/q-lens-apple.png" },
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
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('vq-theme-v1');if(t!=='light')t='dark';{document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;document.querySelector('meta[name=\"theme-color\"]')?.setAttribute('content',t==='dark'?'#070b14':'#ffffff')}}catch(e){document.documentElement.dataset.theme='dark'}" }} />
        <ThemePrompt />
        {children}
        <Welcome />
        <ProfileSetupGate />
        <NotificationBootstrap />
        <PhoneContactPrompt />
        <AskVegas />
      </body>
    </html>
  );
}
