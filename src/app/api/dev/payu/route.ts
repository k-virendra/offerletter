import { readPostedFields } from "@/lib/payu/fields";
import { appUrl, payuConfig } from "@/lib/payu/gateway.server";
import { simulatorCheckout } from "@/lib/payu/simulator";

// DEVELOPMENT ONLY: the simulator's "hosted checkout" page. Refused unless PAYU_MODE is simulator, which itself
// is refused against a hosted database.

export const runtime = "nodejs";

export async function POST(request: Request) {
  const config = (() => {
    try {
      return payuConfig();
    } catch {
      return null;
    }
  })();
  if (config?.mode !== "simulator") return new Response("Not found", { status: 404 });
  return simulatorCheckout(await readPostedFields(request), config, `${appUrl()}/api/dev/payu/complete`);
}
