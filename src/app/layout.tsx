import type { Metadata } from "next";
import "./globals.css";
import "@/components/ask-vegas.css";
import Welcome from "@/components/welcome";
import AskVegas from "@/components/ask-vegas";
export const metadata: Metadata = {
  title: "Vegas Quant | 5-Spot Challenge",
  description:
    "A disciplined research desk. Five stages. Every decision accounted for.",
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
        <AskVegas />
      </body>
    </html>
  );
}
