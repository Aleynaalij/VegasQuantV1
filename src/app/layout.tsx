import type { Metadata, Viewport } from "next";
import "./globals.css";
import "@/components/ask-vegas.css";
import "./experience.css";
import "./sports-light.css";
import "./master.css";
import NotificationBootstrap from "@/components/notification-bootstrap";
import Welcome from "@/components/welcome";
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
  themeColor: "#ffffff",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Welcome />
        <NotificationBootstrap />
        <AskVegas />
      </body>
    </html>
  );
}
