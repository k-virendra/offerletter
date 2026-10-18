import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutHeader } from "@/components/checkout/checkout-header";
import { PlanSummary } from "@/components/websites/plan-summary";
import { WebsiteOrderForm } from "@/components/websites/order-form";
import { getProfile, requireUser } from "@/lib/auth";
import { listCompanies } from "@/lib/companies/queries";
import { countryName, countryOptions } from "@/lib/countries";
import { createClient } from "@/lib/supabase/server";
import { formatDay, todayIso } from "@/lib/template/format";
import { monthEnd, nextDueDate } from "@/lib/websites/periods";
import { activePlan, planMoney } from "@/lib/websites/queries.server";

export const metadata: Metadata = { title: "Order a website" };

export default async function NewWebsitePage() {
  const user = await requireUser("/website/new");
  const supabase = await createClient();
  const [plan, profile, list, { data: subscriptions }] = await Promise.all([
    activePlan(),
    getProfile(),
    listCompanies(),
    supabase.from("subscriptions").select("company_id, status").eq("user_id", user.id).neq("status", "cancelled"),
  ]);
  if (!plan) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col justify-center gap-3 px-6">
        <h1 className="font-display text-3xl font-medium">Websites aren’t available to order right now</h1>
        <p className="text-ink-2">Please try again later.</p>
        <Link href="/website" className="font-semibold text-evergreen-700 underline underline-offset-2">
          Back
        </Link>
      </main>
    );
  }

  // Businesses that don't have a website plan yet (an unpaid order can be finished).
  const taken = new Set((subscriptions ?? []).filter((s) => s.status !== "pending_payment").map((s) => s.company_id));
  const businesses = list.companies
    .filter((c) => !c.archived_at && !c.suspended_at && !taken.has(c.id))
    .map((c) => ({ id: c.id, name: c.legal_name, detail: countryName(c.country_code) }));
  const firstDue = formatDay(nextDueDate(monthEnd(todayIso()))!);
  const only = businesses.length === 1 ? list.companies.find((c) => c.id === businesses[0]!.id) : undefined;

  return (
    <div className="min-h-dvh bg-canvas">
      <CheckoutHeader back={{ href: "/website", label: "Back" }} />
      <main className="mx-auto grid max-w-[1080px] items-start gap-5 px-4 py-6 md:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-x-10 lg:py-10">
        <div className="min-w-0 max-lg:order-1 lg:col-start-1">
          <p className="text-[13px] font-semibold text-evergreen-700">Business website</p>
          <h1 className="font-display text-[30px] leading-tight font-medium">Get your website, domain and email</h1>
          <p className="mt-2 text-ink-2">Tell us about your business. Our team registers your domain, builds your website and sets up your email, and keeps you posted.</p>
        </div>
        <div className="min-w-0 max-lg:order-3 lg:col-start-1">
          <WebsiteOrderForm
            businesses={businesses}
            price={planMoney(plan, plan.onboardingMinor)}
            monthly={planMoney(plan, plan.monthlyMinor)}
            firstDue={firstDue}
            allowance={planMoney(plan, plan.domainAllowanceMinor)}
            countries={countryOptions()}
            defaults={{
              fullName: profile?.full_name ?? "",
              email: profile?.email ?? user.email ?? "",
              companyName: only?.legal_name ?? "",
              country: only?.country_code ?? "IN",
              postalCode: "",
              address: only?.registered_address ?? "",
            }}
          />
        </div>
        <PlanSummary plan={plan} firstDue={firstDue} className="max-lg:order-2 lg:col-start-2 lg:row-span-2 lg:row-start-1" />
      </main>
    </div>
  );
}
