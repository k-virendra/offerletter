import { Globe, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Pill } from "@/components/admin/ui";
import { PlanSummary } from "@/components/websites/plan-summary";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { formatDay, todayIso } from "@/lib/template/format";
import { monthEnd, nextDueDate } from "@/lib/websites/periods";
import { activePlan, ownSubscriptions, SUBSCRIPTION_LABELS } from "@/lib/websites/queries.server";

export const metadata: Metadata = { title: "Website" };

export default async function WebsitesPage() {
  const user = await requireUser("/website");
  const [plan, subscriptions] = await Promise.all([activePlan(), ownSubscriptions(user.id)]);
  const firstDue = formatDay(nextDueDate(monthEnd(todayIso()))!);
  const open = subscriptions.filter((s) => s.status !== "cancelled");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-medium tracking-tight">Business website</h1>
          <p className="mt-1.5 max-w-[640px] text-[15px] text-ink-2">Your own domain, a website built for you and a business email address. Our team sets it all up and looks after it.</p>
        </div>
        {open.length ? (
          <Button asChild variant="secondary">
            <Link href="/website/new" className="no-underline">
              <Plus aria-hidden />
              Another business
            </Link>
          </Button>
        ) : null}
      </div>

      {subscriptions.length ? (
        <ul className="grid gap-4 md:grid-cols-2">
          {subscriptions.map((s) => {
            const label = SUBSCRIPTION_LABELS[s.status];
            const next = nextDueDate(s.paid_through);
            return (
              <li key={s.id}>
                <Link href={`/website/${s.id}`} className="flex h-full flex-col gap-2 rounded-xl border border-line bg-white p-5 no-underline shadow-card hover:border-evergreen-600">
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-lg font-semibold text-ink">{s.companies?.legal_name ?? "Your business"}</span>
                    <Pill tone={label.tone}>{label.text}</Pill>
                  </span>
                  <span className="flex items-center gap-1.5 text-sm text-ink-2">
                    <Globe aria-hidden className="size-4" />
                    {s.domain ?? s.requested_domains[0]}
                  </span>
                  {next && s.status !== "cancelled" && s.status !== "pending_payment" ? <span className="text-[13px] text-muted">Next payment due {formatDay(next)}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}

      {!open.length && plan ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="rounded-2xl border border-line bg-white p-6 shadow-card md:p-8">
            <h2 className="font-display text-[28px] leading-tight font-medium">Get online in days, without the hassle</h2>
            <ol className="mt-5 flex flex-col gap-4">
              {[
                ["Tell us about your business", "Pick the domain you want and what the website should say."],
                ["We set everything up", "We register your domain, build your website and create your business email."],
                ["You’re live", "We let you know at every step. Your website and email are ready to use."],
              ].map(([title, text], index) => (
                <li key={title} className="flex gap-3">
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-evergreen-50 font-semibold text-evergreen-700">{index + 1}</span>
                  <span>
                    <span className="block font-semibold">{title}</span>
                    <span className="text-sm text-ink-2">{text}</span>
                  </span>
                </li>
              ))}
            </ol>
            <Button asChild size="lg" className="mt-6">
              <Link href="/website/new" className="no-underline">
                Get started
              </Link>
            </Button>
          </section>
          <PlanSummary plan={plan} firstDue={firstDue} />
        </div>
      ) : null}
    </div>
  );
}
