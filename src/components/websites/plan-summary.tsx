import { Check } from "lucide-react";
import type { Plan } from "@/lib/websites/queries.server";
import { planMoney } from "@/lib/websites/queries.server";

/** What the website plan includes and costs: today, then on the 1st of every month. */
export function PlanSummary({ plan, firstDue, className }: { plan: Plan; firstDue: string; className?: string }) {
  return (
    <aside aria-labelledby="plan-heading" className={`rounded-xl border border-line bg-white p-5 shadow-card ${className ?? ""}`}>
      <h2 id="plan-heading" className="text-base font-semibold">
        {plan.name}
      </h2>
      {plan.description ? <p className="mt-1 text-sm text-ink-2">{plan.description}</p> : null}
      <ul className="mt-4 flex flex-col gap-2 text-sm text-ink-2">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-evergreen-600" />
            {feature}
          </li>
        ))}
      </ul>
      <dl className="mt-5 flex flex-col gap-3 border-t border-line-soft pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-sm text-ink-2">
            Today
            <span className="block text-[13px] text-muted">Setup, your domain’s first year and the rest of this month</span>
          </dt>
          <dd className="font-display text-2xl font-medium tabular-nums">{planMoney(plan, plan.onboardingMinor)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-sm text-ink-2">
            Then every month
            <span className="block text-[13px] text-muted">Due on the 1st, starting {firstDue}</span>
          </dt>
          <dd className="font-display text-2xl font-medium tabular-nums">{planMoney(plan, plan.monthlyMinor)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[13px] text-muted">Charged in Indian rupees through PayU. Ask to cancel any time from your website page.</p>
    </aside>
  );
}
