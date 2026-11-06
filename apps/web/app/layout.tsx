import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, IBM_Plex_Mono, Quicksand } from "next/font/google";
import "./globals.css";

const display = Barlow_Condensed({ subsets: ["latin"], weight: ["300", "600"], variable: "--font-display" });
const data = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400"], variable: "--font-data" });
const voice = Quicksand({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-voice" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3300"),
  title: "Squeek Time Machine",
  description: "Walk through Squeekchain's history. A living underground archive that grows with every settled Squeek block. Community-built.",
  icons: { icon: "/brand/squeekchain-mark.png" },
  openGraph: { title: "Squeek Time Machine", description: "Don't just read Squeekchain's history. Walk through it.", type: "website" },
  twitter: { card: "summary_large_image" },
  // Squeekchain's builder programme checks for this tag, and rechecks it daily. Keep it.
  other: { "squeekchain-project": "7d5e617b-3cae-401b-8987-2aab281a8e1b" },
};

export const viewport: Viewport = { themeColor: "#0b0b0d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${data.variable} ${voice.variable}`}>
      <body>{children}</body>
    </html>
  );
}
