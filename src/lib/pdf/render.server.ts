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

/**
 * Where headless Chrome opens the print page. Production uses the public site: Vercel's deployment protection
 * guards each deployment's own *.vercel.app address, and Chrome has no Vercel login, so it would get a 401 there.
 * Preview deployments render their own code at that address, let in by the automation bypass secret if set.
 */
function renderTarget(token: string): string {
  const { RENDER_BASE_URL } = serverEnv();
  const trim = (url: string) => url.replace(/\/$/, "");
  if (RENDER_BASE_URL) return `${trim(RENDER_BASE_URL)}/render/${token}`;
  if (process.env.VERCEL_ENV === "production" || !process.env.VERCEL_URL) return `${trim(publicEnv.NEXT_PUBLIC_APP_URL)}/render/${token}`;
  const url = new URL(`https://${process.env.VERCEL_URL}/render/${token}`);
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  // As query parameters, so the secret only goes to this deployment (never to the logo's storage host).
  if (bypass) url.search = new URLSearchParams({ "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" }).toString();
  return url.href;
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
    const response = await page.goto(renderTarget(token), { waitUntil: "domcontentloaded", timeout: 30_000 });
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
