import { readPostedFields } from "@/lib/payu/fields";
import { appUrl, payuConfig } from "@/lib/payu/gateway.server";
import { simulatorComplete } from "@/lib/payu/simulator";

// DEVELOPMENT ONLY: the simulator records the chosen outcome and returns the customer to the app.

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
  const fields = await readPostedFields(request);
  return simulatorComplete(fields.txnid ?? "", fields.outcome ?? "", config, `${appUrl()}/api/payu/webhook`);
}
