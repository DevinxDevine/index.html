// src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Sparkle Clean — Professional Home Cleaning",
    template: "%s | Sparkle Clean",
  },
  description:
    "Book vetted professional cleaners online. Instant pricing, before/after photos, and full dispute protection.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://sparkleclean.com"
  ),
  openGraph: {
    type: "website",
    siteName: "Sparkle Clean",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
