import { expect, test, type Page } from "@playwright/test";
import { PDFDict, PDFDocument, PDFName, PDFString } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";
import { LENA_VALUES, sampleValues } from "../src/lib/letter/samples";
import { signRenderToken } from "../src/lib/pdf/token";
import { createTestUser, seedCompanies, seedLetter, signInAsNewUser, testAdmin } from "./support/accounts";

// PDFs: watermarked previews through the API (headless Chrome on the server), issued versions with stored final
// PDFs, every style in every launch country through the print page, and pixel snapshots of page 1 per style.

const LAUNCH = ["DE", "IE", "NL", "GB", "AU", "NZ", "CA-ON", "CA-BC", "CA-AB", "US", "US-CA", "US-NY"];
const STYLES = ["classic", "modern", "minimal", "executive", "bold"];
const A4 = [595.28, 841.89];
const LETTER = [612, 792];

/** Text without spaces, lower-case: letter-spaced headings come out of PDFs as "a c c e p t e d". */
const compact = (text: string) => text.replace(/\s+/g, "").toLowerCase();

function expectSize(pdf: PDFDocument, [width, height]: number[]) {
  const size = pdf.getPage(0).getSize();
  expect(Math.abs(size.width - width!)).toBeLessThan(0.5);
  expect(Math.abs(size.height - height!)).toBeLessThan(0.5);
}

/** The fonts a PDF embeds, e.g. "AAAAAA+MrsSaintDelafield-Regular". */
function fontNames(pdf: PDFDocument): string[] {
  return pdf.context
    .enumerateIndirectObjects()
    .flatMap(([, object]) => (object instanceof PDFDict && object.get(PDFName.of("Type")) === PDFName.of("Font") ? [object.get(PDFName.of("BaseFont"))?.toString() ?? ""] : []));
}

async function pagesText(bytes: Uint8Array): Promise<string[]> {
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: false });
  return text.map((page) => page.replace(/\s+/g, " "));
}

async function openPrintPage(page: Page, letterId: string, watermark = false) {
  const token = signRenderToken({ kind: "draft", id: letterId, watermark }, process.env.RENDER_TOKEN_SECRET!, 120);
  await page.goto(`/render/${token}`);
  await expect(page.locator("html")).toHaveAttribute("data-letter-ready", "true");
}

test.describe("preview PDF", () => {
  test("a watermarked, tagged PDF of the saved draft", async ({ page, isMobile }) => {
    test.skip(isMobile, "Server-side PDFs don't depend on the device.");
    const { userId } = await signInAsNewUser(page, "pdf-preview", "/dashboard");
    const [company] = await seedCompanies(userId, ["Example Engineering GmbH"]);
    const values = { ...LENA_VALUES, "position.reports_to": "" };
    const letterId = await seedLetter(userId, company!.id, { jurisdiction: "DE", values, name: "Lena Hoffmann – Senior Backend Engineer" });

    const response = await page.request.get(`/api/letters/${letterId}/preview-pdf`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    expect(response.headers()["content-disposition"]).toContain("inline");
    const bytes = await response.body();

    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(2);
    expectSize(pdf, A4);
    expect(pdf.getTitle()).toBe("Offer of employment – Lena Hoffmann (preview)");
    expect(pdf.getAuthor()).toBe("Example Engineering GmbH");
    expect(pdf.getSubject()).toBe("Offer of employment: Senior Backend Engineer");
    expect(pdf.catalog.lookup(PDFName.of("Lang"), PDFString).decodeText()).toBe("en");
    // Tagged PDF: a structure tree and the "marked" flag survive setting the metadata.
    expect(pdf.catalog.get(PDFName.of("StructTreeRoot"))).toBeDefined();
    expect(pdf.catalog.lookup(PDFName.of("MarkInfo"), PDFDict).get(PDFName.of("Marked"))?.toString()).toBe("true");

    const text = await pagesText(bytes);
    for (const pageText of text) {
      expect(compact(pageText)).toContain("preview–notvalid");
      expect(pageText).toContain("Example Engineering GmbH never charges candidates fees.");
    }
    expect(text[0]).toContain("Lena Hoffmann");
    expect(text[0]).toContain("Page 1 of 2");
    // The empty required field prints as its label.
    expect(compact(text[0]!)).toContain("youwillreporttoreportsto.");
  });

  test("previews are rate-limited", async ({ page, isMobile }) => {
    test.skip(isMobile, "Server-side PDFs don't depend on the device.");
    const { userId } = await signInAsNewUser(page, "pdf-limit", "/dashboard");
    const [company] = await seedCompanies(userId, ["Example Engineering GmbH"]);
    const letterId = await seedLetter(userId, company!.id, { jurisdiction: "DE", values: LENA_VALUES });
    const windowStart = new Date(Math.floor(Date.now() / 600_000) * 600_000).toISOString();
    await testAdmin().from("rate_limits").insert({ key: `pdf-preview:${userId}`, window_start: windowStart, hits: 10 });

    const response = await page.request.get(`/api/letters/${letterId}/preview-pdf`);
    expect(response.status()).toBe(429);
    expect(await response.text()).toContain("Too many previews for now");
  });

  test("another user's letter can't be previewed", async ({ page, isMobile }) => {
    test.skip(isMobile, "Server-side PDFs don't depend on the device.");
    const owner = await createTestUser("pdf-owner");
    const [company] = await seedCompanies(owner, ["Example Engineering GmbH"]);
    const letterId = await seedLetter(owner, company!.id, { jurisdiction: "DE", values: LENA_VALUES });
    await signInAsNewUser(page, "pdf-stranger", "/dashboard");
    const response = await page.request.get(`/api/letters/${letterId}/preview-pdf`);
    expect(response.status()).toBe(404);
  });

  test("the editor's Preview PDF button opens the PDF in a new tab", async ({ page }) => {
    const { userId } = await signInAsNewUser(page, "pdf-button", "/dashboard");
    const [company] = await seedCompanies(userId, ["Example Engineering GmbH"]);
    const letterId = await seedLetter(userId, company!.id, { jurisdiction: "DE", values: LENA_VALUES });
    await page.goto(`/letters/${letterId}/edit`);
    // Headless Chrome downloads the PDF rather than showing it, so watch the tab's request instead of its page.
    const request = page.context().waitForEvent("request", (r) => r.url().endsWith(`/api/letters/${letterId}/preview-pdf`));
    await page.getByRole("button", { name: "Preview PDF" }).click();
    const response = await (await request).response();
    expect(response?.status()).toBe(200);
    expect(response?.headers()["content-type"]).toBe("application/pdf");
  });
});

test.describe("issued versions", () => {
  test("issuing stores a final PDF without the watermark, and downloads are logged", async ({ page, isMobile }) => {
    test.skip(isMobile, "Server-side PDFs don't depend on the device.");
    const { userId } = await signInAsNewUser(page, "pdf-issue", "/dashboard");
    const [company] = await seedCompanies(userId, ["Sample Analytics Inc."]);
    const incomplete = await seedLetter(userId, company!.id, { jurisdiction: "US-NY", values: { ...sampleValues("US-NY"), "position.job_title": "" } });
    expect((await page.request.post(`/api/dev/letters/${incomplete}/issue`)).status()).toBe(422);

    const letterId = await seedLetter(userId, company!.id, { jurisdiction: "US-NY", template: "modern", values: sampleValues("US-NY") });
    const issued = await page.request.post(`/api/dev/letters/${letterId}/issue`);
    expect(issued.status()).toBe(200);
    const first = (await issued.json()) as { version: number; pdfPath: string; contentHash: string; versionId: string };
    expect(first.version).toBe(1);
    expect(first.pdfPath).toBe(`${userId}/${letterId}/v1-${first.contentHash.slice(0, 12)}.pdf`);

    const download = await page.request.get(`/api/letters/${letterId}/versions/1/pdf`, { maxRedirects: 0 });
    expect(download.status()).toBe(303);
    const stored = await page.request.get(download.headers().location!);
    expect(stored.status()).toBe(200);
    const bytes = await stored.body();
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()).toBe("Offer of employment – Lena Hoffmann");
    expectSize(pdf, LETTER);
    const text = (await pagesText(bytes)).join(" ");
    expect(compact(text)).not.toContain("preview");
    expect(text).toContain("New York Labor Law");
    expect(text).toContain("1 of"); // Modern's footer: "Page 1 of N"
    // The signatory's name in handwriting, with the handwriting font itself in the file (not a fallback).
    expect(fontNames(pdf).some((name) => name.includes("MrsSaintDelafield"))).toBe(true);

    const admin = testAdmin();
    const { data: letter } = await admin.from("letters").select("current_version, pinned_clauses").eq("id", letterId).single();
    expect(letter?.current_version).toBe(1);
    expect(Object.keys(letter?.pinned_clauses as object)).toContain("required_information");
    const { count } = await admin.from("downloads").select("id", { count: "exact", head: true }).eq("letter_version_id", first.versionId);
    expect(count).toBe(1);

    // The PDF of a version can't be replaced.
    const { error } = await admin.from("letter_versions").update({ pdf_path: "elsewhere.pdf" }).eq("id", first.versionId);
    expect(error?.message).toContain("cannot be replaced");

    const second = (await (await page.request.post(`/api/dev/letters/${letterId}/issue`)).json()) as { version: number; pdfPath: string };
    expect(second.version).toBe(2);
    expect(second.pdfPath).not.toBe(first.pdfPath);
    expect((await page.request.get(`/api/letters/${letterId}/versions/3/pdf`, { maxRedirects: 0 })).status()).toBe(404);
  });
});

test.describe("every style in every launch country", () => {
  // 60 PDFs: one at a time, so they don't crowd out the rest of the suite on a shared local server.
  test.describe.configure({ mode: "serial" });
  test.skip(({ isMobile }) => isMobile, "Print layout doesn't depend on the device.");
  let userId = "";
  let companyId = "";
  test.beforeAll(async () => {
    userId = await createTestUser("pdf-matrix");
    companyId = (await seedCompanies(userId, ["Example Engineering GmbH"]))[0]!.id;
  });

  for (const code of LAUNCH) {
    test(`${code}: all five styles print with a footer on every page`, async ({ page }) => {
      const letterId = await seedLetter(userId, companyId, { jurisdiction: code, values: sampleValues(code) });
      const size = code.startsWith("US") || code.startsWith("CA") ? LETTER : A4;
      for (const style of STYLES) {
        await testAdmin().from("letters").update({ template_key: style }).eq("id", letterId);
        await openPrintPage(page, letterId);
        const bytes = await page.pdf({ preferCSSPageSize: true, printBackground: true });
        const pdf = await PDFDocument.load(bytes);
        const pages = pdf.getPageCount();
        expect(pages, `${code} ${style}`).toBeGreaterThanOrEqual(1);
        expect(pages, `${code} ${style}`).toBeLessThanOrEqual(4);
        expectSize(pdf, size);
        const text = (await pagesText(bytes)).map(compact);
        text.forEach((pageText, index) => {
          expect(pageText, `${code} ${style} page ${index + 1}`).toContain("nevercharges candidatesfees".replace(/\s/g, ""));
          expect(pageText, `${code} ${style} page ${index + 1}`).toMatch(new RegExp(`${index + 1}(of|/)${pages}`));
        });
        // Signature blocks never split, so the candidate's acceptance is on the last page.
        expect(text.at(-1), `${code} ${style}`).toContain("acceptedbythecandidate");
        expect(await page.locator("[data-letter-page]").count()).toBe(pages);
      }
    });
  }
});

test.describe("page 1 of each style looks as approved", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(({ isMobile }) => isMobile, "Print layout doesn't depend on the device.");
  for (const [code, paper] of [
    ["DE", "a4"],
    ["US-NY", "letter"],
  ] as const) {
    for (const style of STYLES) {
      test(`${style} on ${paper}`, async ({ page }) => {
        const userId = await createTestUser(`pdf-look-${style}-${paper}`);
        const [company] = await seedCompanies(userId, ["Example Engineering GmbH"]);
        await testAdmin().from("companies").update({ brand_color: "#1F4E8C" }).eq("id", company!.id);
        const letterId = await seedLetter(userId, company!.id, { jurisdiction: code, template: style, values: sampleValues(code) });
        await page.setViewportSize({ width: 1000, height: 1200 });
        await openPrintPage(page, letterId);
        // The letter is dated today: mask the date so the picture is stable from day to day.
        const today = new Date().toISOString().slice(0, 10);
        const date = new Intl.DateTimeFormat(paper === "a4" ? "en-DE" : "en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${today}T00:00:00Z`));
        await expect(page.locator('[data-letter-page="1"]')).toHaveScreenshot(`${style}-${paper}.png`, {
          mask: [page.locator('[data-letter-page="1"]').getByText(date)],
          maxDiffPixelRatio: 0.01,
        });
      });
    }
  }
});
