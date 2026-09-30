import type { Metadata } from "next";
import "./globals.css";
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
      <body>{children}</body>
    </html>
  );
}
