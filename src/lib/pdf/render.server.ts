import "server-only";
import type { Browser } from "puppeteer-core";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { withMetadata, type PdfMetadata } from "./metadata";
import { signRenderToken, type RenderTarget } from "./token";

// PDFs are printed by headless Chromium from the print page (/render/<token>), which lays out the same pages as the
// live preview. On Vercel (Linux) the browser comes from @sparticuz/chromium; locally from a Chrome install.

const MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const READY = 'html[data-letter-ready="true"]';
const FAILED = 'html[data-letter-ready="error"]';

let browser: Promise<Browser> | null = null;

async function launch(): Promise<Browser> {
  const puppeteer = await import("puppeteer-core");
  const { CHROME_EXECUTABLE_PATH } = serverEnv();
  // pipe: true talks to Chrome over stdin/stdout, so Chrome quits when the server process dies (even when it's
  // killed outright) instead of lingering as an orphan.
  if (CHROME_EXECUTABLE_PATH || process.platform === "darwin") {
    return puppeteer.launch({
      executablePath: CHROME_EXECUTABLE_PATH ?? MAC_CHROME,
      headless: true,
      pipe: true,
      args: ["--no-first-run", "--font-render-hinting=none"],
    });
  }
  const chromium = (await import("@sparticuz/chromium")).default;
  return puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, pipe: true, args: [...chromium.args, "--font-render-hinting=none"] });
}

/** One browser per server instance, started on first use and replaced if it crashes. */
function getBrowser(): Promise<Browser> {
  browser ??= launch().then((started) => {
    started.on("disconnected", () => {
      browser = null;
    });
    return started;
  });
  browser.catch(() => {
    browser = null;
  });
  return browser;
}

function renderBaseUrl(): string {
  const { RENDER_BASE_URL } = serverEnv();
  if (RENDER_BASE_URL) return RENDER_BASE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
}

export type { PdfMetadata } from "./metadata";

export class PdfRenderError extends Error {
  override name = "PdfRenderError";
}

/** Prints a letter (draft or issued version) to PDF bytes with its document metadata set. */
export async function renderLetterPdf(target: RenderTarget, metadata: PdfMetadata): Promise<Uint8Array> {
  const token = signRenderToken(target, serverEnv().RENDER_TOKEN_SECRET, 60);
  const page = await (await getBrowser()).newPage();
  try {
    const response = await page.goto(`${renderBaseUrl()}/render/${token}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (!response?.ok()) throw new PdfRenderError(`The print page answered ${response?.status() ?? "nothing"}`);
    const outcome = await page.waitForSelector(`${READY}, ${FAILED}`, { timeout: 30_000 });
    if (await outcome?.evaluate((element) => element.getAttribute("data-letter-ready") === "error")) {
      throw new PdfRenderError("The letter couldn't be laid out");
    }
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true, tagged: true, outline: false, timeout: 30_000 });
    return await withMetadata(pdf, metadata);
  } finally {
    await page.close().catch(() => {});
  }
}
