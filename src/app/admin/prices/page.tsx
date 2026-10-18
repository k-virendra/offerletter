import type { Metadata } from "next";
import { activatePrice } from "@/app/admin/actions";
import { ActionButton } from "@/components/admin/controls";
import { AddPriceForm, PlanForm } from "@/components/admin/forms";
import { AdminCard, AdminHeader, AdminTable, Pill, td, th } from "@/components/admin/ui";
import { formatMoney } from "@/lib/payments/prices.server";
import { createClient } from "@/lib/supabase/server";
import { formatDay } from "@/lib/template/format";

export const metadata: Metadata = { title: "Prices" };

export default async function AdminPricesPage() {
  const supabase = await createClient();
  const { data: plans } = await supabase.from("plans").select("id, name, description, onboarding_minor, monthly_minor, domain_allowance_minor, active").order("sort_order");
  const { data: prices } = await supabase.from("prices").select("id, purpose, currency, amount_minor, active, notes, created_at").order("purpose").order("active", { ascending: false }).order("created_at", { ascending: false });

  return (
    <>
      <AdminHeader
        title="Prices"
        description="One display price (shown on the site and at checkout) and one charge price (sent to PayU) are on at a time. Prices are never edited: add a new one and switch it on, so past payments keep the price they were made at."
      />
      {(plans ?? []).map((plan) => (
        <AdminCard key={plan.id} id={`plan-${plan.id}`} title={`${plan.name} (website plan)`} className="mb-5">
          <p className="mb-3 text-sm text-ink-2">Invoices already issued keep their amount; new invoices use these prices.</p>
          <PlanForm
            planId={plan.id}
            onboarding={String(plan.onboarding_minor / 100)}
            monthly={String(plan.monthly_minor / 100)}
            allowance={String(plan.domain_allowance_minor / 100)}
          />
        </AdminCard>
      ))}
      <h2 className="mb-3 text-lg font-semibold">Offer letter prices</h2>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <AdminCard id="all-prices" title="All prices">
          <AdminTable caption="Prices" minWidth={560}>
            <thead>
              <tr>
                <th className={th}>Price</th>
                <th className={th}>Used for</th>
                <th className={th}>Status</th>
                <th className={`${th} text-right`}>Action</th>
              </tr>
            </thead>
            <tbody>
              {(prices ?? []).map((price) => {
                const amount = formatMoney({ currency: price.currency, amountMinor: price.amount_minor });
                return (
                  <tr key={price.id}>
                    <td className={td}>
                      <p className="font-semibold tabular-nums">{amount}</p>
                      <p className="text-[13px] text-ink-2">
                        Added {formatDay(price.created_at)}
                        {price.notes ? ` · ${price.notes}` : ""}
                      </p>
                    </td>
                    <td className={td}>{price.purpose === "display" ? "Shown to people" : "Sent to PayU"}</td>
                    <td className={td}>
                      <Pill tone={price.active ? "success" : "outline"}>{price.active ? "Active" : "Inactive"}</Pill>
                    </td>
                    <td className={`${td} text-right`}>
                      {price.active ? null : (
                        <ActionButton
                          action={activatePrice.bind(null, price.id)}
                          confirm={{
                            title: `Switch on ${amount}?`,
                            description:
                              price.purpose === "display"
                                ? `${amount} will be shown on the site and at checkout from now on. If PayU charges a different currency, checkout explains the conversion.`
                                : `New checkouts will ask PayU for ${amount}. Payments already started keep their amount.`,
                            confirmLabel: "Switch it on",
                            tone: "primary",
                          }}
                        >
                          Switch on
                        </ActionButton>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </AdminTable>
        </AdminCard>
        <AdminCard id="add-price" title="Add a price">
          <AddPriceForm />
        </AdminCard>
      </div>
    </>
  );
}
