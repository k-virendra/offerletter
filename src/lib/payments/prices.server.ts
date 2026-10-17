import "server-only";
import { adminClient } from "@/lib/supabase/admin";

// Prices come from the database, never from the browser. "display" is what people see and "charge" is what PayU
// is asked to collect: both ₹799 now. They can differ (say, US$9 shown and ₹799 charged); checkout then says so.

export type Money = { currency: string; amountMinor: number };

export async function activePrices(product = "offer_letter"): Promise<{ display: Money; charge: Money }> {
  const { data, error } = await adminClient().from("prices").select("purpose, currency, amount_minor").eq("product", product).eq("active", true);
  if (error) throw new Error(`Prices couldn't be read: ${error.message}`);
  const pick = (purpose: "display" | "charge") => {
    const row = data.find((price) => price.purpose === purpose);
    if (!row) throw new Error(`No active ${purpose} price for ${product}`);
    return { currency: row.currency, amountMinor: row.amount_minor };
  };
  return { display: pick("display"), charge: pick("charge") };
}

/** "₹799.00", "US$9.00". */
export function formatMoney({ currency, amountMinor }: Money): string {
  // en-IN groups rupees the Indian way (₹1,00,000); other currencies read the same in en-GB.
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-GB", { style: "currency", currency, minimumFractionDigits: 2 }).format(amountMinor / 100);
}

/** The price on the Pay button and the public pages, without decimals when it's whole: "₹799". */
export async function displayPriceLabel(): Promise<string> {
  try {
    const { display } = await activePrices();
    const whole = display.amountMinor % 100 === 0;
    return new Intl.NumberFormat(display.currency === "INR" ? "en-IN" : "en-GB", {
      style: "currency",
      currency: display.currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(display.amountMinor / 100);
  } catch (error) {
    console.error("couldn't read the display price", error);
    return "";
  }
}
