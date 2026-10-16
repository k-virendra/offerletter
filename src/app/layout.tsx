import type { Metadata, Viewport } from "next";
import { newsreader, plex, sourceSerif } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Offer Letter PDF", template: "%s · Offer Letter PDF" },
  description:
    "Create a correct, branded offer letter for hires in Europe, the UK, Australia, New Zealand, Canada or the US, and download a print-ready PDF.",
};

export const viewport: Viewport = { themeColor: "#0F6E5F" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${plex.variable} ${newsreader.variable} ${sourceSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
