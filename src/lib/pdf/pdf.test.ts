import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { withMetadata } from "./metadata";
import { canonicalJson, contentHash, type IssuedCompany, type IssuedSnapshot } from "./snapshot";
import { signRenderToken, verifyRenderToken } from "./token";

const SECRET = "test-secret-that-is-long-enough-for-hmac-1234";
const ID = "4086d2db-1981-465f-8349-ffd79960c186";

describe("render tokens", () => {
  it("round-trips a target until it expires", () => {
    const now = Date.UTC(2026, 9, 16, 12);
    const token = signRenderToken({ kind: "draft", id: ID, watermark: true }, SECRET, 60, now);
    expect(verifyRenderToken(token, SECRET, now + 59_000)).toEqual({ kind: "draft", id: ID, watermark: true });
    expect(verifyRenderToken(token, SECRET, now + 61_000)).toBeNull();
  });

  it("refuses tampered tokens and other secrets", () => {
    const token = signRenderToken({ kind: "version", id: ID, watermark: false }, SECRET);
    const [body, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ v: 1, k: "v", id: ID, wm: 0, exp: 9_999_999_999 })).toString("base64url");
    expect(verifyRenderToken(`${forged}.${signature}`, SECRET)).toBeNull();
    expect(verifyRenderToken(token, `${SECRET}-other`)).toBeNull();
    expect(verifyRenderToken(`${body}.`, SECRET)).toBeNull();
    expect(verifyRenderToken("not-a-token", SECRET)).toBeNull();
  });

  it("only signs UUID targets with a strong secret", () => {
    expect(() => signRenderToken({ kind: "draft", id: "../../etc", watermark: true }, SECRET)).toThrow();
    expect(() => signRenderToken({ kind: "draft", id: ID, watermark: true }, "short")).toThrow();
  });
});

describe("version snapshots", () => {
  const company = { id: "c", legalName: "Example GmbH", logo: null } as unknown as IssuedCompany;
  const snapshot = { schema: 1, date: "2026-10-16", context: { b: 1, a: [2, { d: 3, c: 4 }] }, state: { name: "x" } } as unknown as IssuedSnapshot;

  it("hash the same content the same way, whatever the key order", () => {
    const reordered = { state: { name: "x" }, context: { a: [2, { c: 4, d: 3 }], b: 1 }, date: "2026-10-16", schema: 1 } as unknown as IssuedSnapshot;
    expect(contentHash(reordered, company)).toBe(contentHash(snapshot, company));
    expect(contentHash(snapshot, company)).toMatch(/^[0-9a-f]{64}$/);
    expect(contentHash({ ...snapshot, date: "2026-10-17" }, company)).not.toBe(contentHash(snapshot, company));
    expect(canonicalJson({ b: undefined, a: 1 })).toBe('{"a":1}');
  });
});

describe("PDF metadata", () => {
  it("sets title, author, subject and language", async () => {
    const blank = await PDFDocument.create();
    blank.addPage([595.28, 841.89]);
    const out = await withMetadata(await blank.save(), {
      title: "Offer of employment – Lena Hoffmann",
      author: "Example Engineering GmbH",
      subject: "Offer of employment: Senior Backend Engineer",
    });
    const read = await PDFDocument.load(out);
    expect(read.getTitle()).toBe("Offer of employment – Lena Hoffmann");
    expect(read.getAuthor()).toBe("Example Engineering GmbH");
    expect(read.getSubject()).toBe("Offer of employment: Senior Backend Engineer");
    expect(read.getCreator()).toBe("AI Company Wala");
    expect(read.catalog.lookup(PDFName.of("Lang"), PDFString).decodeText()).toBe("en");
  });
});
