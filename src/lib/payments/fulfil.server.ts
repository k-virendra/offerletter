import "server-only";
import { completeInvoicePayment } from "@/lib/websites/complete.server";
import { completePaidLetter } from "./complete.server";

// What a confirmed payment unlocks, by what it paid for. Each handler is safe to call again: the return, the
// webhook and the recheck job may all get here for the same payment.
export async function fulfilPayment(payment: { id: string; kind: "letter" | "invoice" }): Promise<void> {
  if (payment.kind === "invoice") await completeInvoicePayment(payment.id);
  else await completePaidLetter(payment.id);
}
