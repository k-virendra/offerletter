import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { LogoMark } from "@/components/logo";
import { Toaster } from "@/components/ui/toast";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: { template: `%s · Admin · ${BRAND.name}`, default: `Admin · ${BRAND.name}` },
  robots: { index: false },
};

// The admin panel, with its own dark sidebar (Admin boards on the design canvas). Every page and action checks
// the admin role again on the server; RLS is the second line.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const supabase = await createClient();
  const [inReview, newReports, toSetUp] = await Promise.all([
    supabase.from("clause_variants").select("id", { count: "exact", head: true }).eq("review_status", "in_review"),
    supabase.from("abuse_reports").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "onboarding"),
  ]);

  const items = [
    { href: "/admin", label: "Overview" },
    { href: "/admin/websites", label: "Websites", count: toSetUp.count ?? 0, countLabel: "to set up" },
    { href: "/admin/clauses", label: "Clause library", count: inReview.count ?? 0 },
    { href: "/admin/countries", label: "Countries" },
    { href: "/admin/styles", label: "Letter styles" },
    { href: "/admin/companies", label: "Companies" },
    { href: "/admin/reports", label: "Misuse reports", count: newReports.count ?? 0, tone: "danger" as const },
    { href: "/admin/payments", label: "Payments" },
    { href: "/admin/prices", label: "Prices" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-canvas md:flex-row md:bg-[linear-gradient(to_right,#141A23_240px,var(--color-canvas)_240px)]" data-no-print>
      <aside className="flex shrink-0 flex-col gap-4 bg-[#141A23] px-3 py-3 md:sticky md:top-0 md:h-screen md:w-[240px] md:gap-6 md:self-start md:px-3.5 md:py-5">
        <div className="flex items-center gap-2.5 px-2">
          <Link href="/dashboard" aria-label={`${BRAND.name}, back to the app`} className="flex min-w-0 items-center gap-2.5 rounded-md no-underline">
            <LogoMark />
            <span className="flex min-w-0 flex-col">
              <span className="font-display text-[17px] leading-tight font-medium whitespace-nowrap text-white">{BRAND.name}</span>
              <span className="mt-0.5 self-start rounded-full bg-marigold-500 px-1.5 text-[10px] font-bold tracking-wide text-ink">ADMIN</span>
            </span>
          </Link>
        </div>
        <AdminNav items={items} />
        <Link href="/dashboard" className="mt-auto hidden min-h-11 items-center px-3 text-sm text-[#C9CED6] hover:text-white md:flex">
          Back to the app
        </Link>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">
        <div className="mx-auto max-w-[1180px]">{children}</div>
      </main>
      <Toaster />
    </div>
  );
}
