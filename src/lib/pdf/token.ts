import { createHmac, timingSafeEqual } from "node:crypto";

// Short-lived signed links for the print page. Headless Chrome has no user session, so the server that checked
// the user's access mints a token naming exactly one draft or issued version, valid for a minute.

/** `language`: the letter's English wording by default, or the translation issued with it ("de"). */
export type RenderTarget = { kind: "draft" | "version"; id: string; watermark: boolean; language?: string };

type Payload = { v: 1; k: "d" | "v"; id: string; wm: 0 | 1; lang?: string; exp: number };

const LANGUAGE = /^[a-z]{2}$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function signRenderToken(target: RenderTarget, secret: string, ttlSeconds = 60, now = Date.now()): string {
  if (secret.length < 32) throw new Error("RENDER_TOKEN_SECRET must be at least 32 characters");
  if (!UUID.test(target.id)) throw new Error("Render targets are identified by UUID");
  if (target.language !== undefined && !LANGUAGE.test(target.language)) throw new Error("Render languages are two-letter codes");
  const payload: Payload = { v: 1, k: target.kind === "draft" ? "d" : "v", id: target.id, wm: target.watermark ? 1 : 0, exp: Math.floor(now / 1000) + ttlSeconds };
  if (target.language && target.language !== "en") payload.lang = target.language;
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

/** The target, or null when the token is malformed, tampered with or expired. */
export function verifyRenderToken(token: string, secret: string, now = Date.now()): RenderTarget | null {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Payload;
    if (payload.v !== 1 || (payload.k !== "d" && payload.k !== "v") || !UUID.test(payload.id) || payload.exp * 1000 < now) return null;
    if (payload.lang !== undefined && !LANGUAGE.test(payload.lang)) return null;
    return { kind: payload.k === "d" ? "draft" : "version", id: payload.id, watermark: payload.wm === 1, language: payload.lang ?? "en" };
  } catch {
    return null;
  }
}
