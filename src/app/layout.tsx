import type { Metadata, Viewport } from "next";
import { newsreader, plex, signatureFlowing, signatureHand, signatureQuick, sourceSerif } from "./fonts";
import "./globals.css";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: { default: BRAND.name, template: `%s · ${BRAND.name}` },
  description: "Business websites with your own domain and email, set up for you, and offer letters for hiring in Europe, the UK, Australia, New Zealand, Canada or the US.",
};

export const viewport: Viewport = { themeColor: "#0F6E5F" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${plex.variable} ${newsreader.variable} ${sourceSerif.variable} ${signatureFlowing.variable} ${signatureQuick.variable} ${signatureHand.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
