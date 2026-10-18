import { getUser } from "@/lib/auth";
import { takeRateLimit } from "@/lib/rate-limit";
import { isDomain, normalizeDomain, type DomainCheck } from "@/lib/websites/order";

// A best-effort "is this domain taken?" hint for the order form, from the public RDAP registry data (no account
// or key needed): registered domains have a record, free ones don't. It's only a hint: the team confirms when
// buying, and some registries don't answer RDAP at all.

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  const domain = normalizeDomain(new URL(request.url).searchParams.get("domain") ?? "");
  if (!isDomain(domain)) return Response.json({ error: "Not a domain" }, { status: 400 });
  if (!(await takeRateLimit(`domain-check:${user.id}`, 600, 40))) return Response.json({ error: "Too many checks" }, { status: 429 });

  let result: DomainCheck["result"] = "unknown";
  try {
    const response = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { accept: "application/rdap+json" },
      redirect: "follow",
      signal: AbortSignal.timeout(5_000),
    });
    if (response.status === 404) result = "available";
    else if (response.ok) result = "taken";
  } catch {
    // Unknown: the registry didn't answer in time.
  }
  return Response.json({ domain, result } satisfies DomainCheck, { headers: { "cache-control": "private, max-age=300" } });
}
