import { Herr_Von_Muellerhoff, IBM_Plex_Sans, La_Belle_Aurore, Mrs_Saint_Delafield, Newsreader, Source_Serif_4 } from "next/font/google";

// Self-hosted by Next.js at build time (no requests to Google from the browser).
export const plex = IBM_Plex_Sans({ subsets: ["latin", "latin-ext"], weight: ["300", "400", "500", "600", "700"], variable: "--font-plex", display: "swap" });
export const newsreader = Newsreader({ subsets: ["latin", "latin-ext"], axes: ["opsz"], variable: "--font-newsreader", display: "swap" });
export const sourceSerif = Source_Serif_4({ subsets: ["latin", "latin-ext"], weight: ["400", "600"], style: ["normal", "italic"], variable: "--font-source-serif", display: "swap" });

// Handwriting for typed signatures (letters only, so not preloaded on every page; the print page waits for them).
export const signatureFlowing = Mrs_Saint_Delafield({ subsets: ["latin", "latin-ext"], weight: "400", variable: "--font-signature-flowing", display: "swap", preload: false });
export const signatureQuick = Herr_Von_Muellerhoff({ subsets: ["latin", "latin-ext"], weight: "400", variable: "--font-signature-quick", display: "swap", preload: false });
export const signatureHand = La_Belle_Aurore({ subsets: ["latin"], weight: "400", variable: "--font-signature-hand", display: "swap", preload: false });
