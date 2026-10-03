import type { Metadata, Viewport } from "next";
import "./globals.css";
import "@/components/ask-vegas.css";
import "./experience.css";
import NotificationBootstrap from "@/components/notification-bootstrap";
import Welcome from "@/components/welcome";
import AskVegas from "@/components/ask-vegas";
export const metadata: Metadata = {
  applicationName: "Vegas Quant",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Vegas Quant",
  },
  icons: { apple: "/icons/apple-touch-icon.png" },
  title: "Vegas Quant | 5-Spot Challenge",
  description:
    "A disciplined research desk. Five stages. Every decision accounted for.",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#080e12",
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
