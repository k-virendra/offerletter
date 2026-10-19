"use client";

import { Loader2, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

type Job = "payment-check" | "billing";

function describe(job: Job, s: Record<string, number>): string {
  if (job === "billing") {
    return `Billing done: ${s.issued ?? 0} ${s.issued === 1 ? "invoice" : "invoices"} issued, ${s.overdue ?? 0} ${s.overdue === 1 ? "plan" : "plans"} now past due, ${s.emailed ?? 0} ${s.emailed === 1 ? "email" : "emails"} sent.`;
  }
  return `Payments checked: ${s.rechecked ?? 0} asked of PayU, ${s.completed ?? 0} finished, ${s.abandoned ?? 0} abandoned ${s.abandoned === 1 ? "checkout" : "checkouts"} closed.`;
}

export function RunJobButton({ job, label }: { job: Job; label: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const response = await fetch(`/api/admin/jobs/${job}`, { method: "POST" }).catch(() => null);
          const body = (await response?.json().catch(() => null)) as (Record<string, number> & { error?: string }) | null;
          if (!response?.ok || !body) {
            toast(body?.error ?? "The job couldn’t run. Check your connection and try again.");
            return;
          }
          const failures = body.errors ? ` ${body.errors} couldn’t be done; see the logs.` : "";
          toast(`${describe(job, body)}${failures}`);
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Play aria-hidden />}
      {pending ? "Running…" : label}
    </Button>
  );
}
