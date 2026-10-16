import { IBM_Plex_Sans, Newsreader, Source_Serif_4 } from "next/font/google";

// Self-hosted by Next.js at build time (no requests to Google from the browser).
export const plex = IBM_Plex_Sans({ subsets: ["latin", "latin-ext"], weight: ["300", "400", "500", "600", "700"], variable: "--font-plex", display: "swap" });
export const newsreader = Newsreader({ subsets: ["latin", "latin-ext"], axes: ["opsz"], variable: "--font-newsreader", display: "swap" });
export const sourceSerif = Source_Serif_4({ subsets: ["latin", "latin-ext"], weight: ["400", "600"], style: ["normal", "italic"], variable: "--font-source-serif", display: "swap" });
