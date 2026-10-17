import { LogOut, Plus } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/app/(auth)/sign-in/actions";
import { MobileNav } from "@/components/app/mobile-nav";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { Wordmark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toast";
import { getProfile, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [profile, supabase] = await Promise.all([getProfile(), createClient()]);
  const { count } = await supabase.from("companies").select("id", { count: "exact", head: true }).eq("owner_id", user.id);
  const limit = profile?.company_limit ?? 5;
  const name = profile?.full_name || user.email || "Your account";
  const initials = (profile?.full_name || user.email || "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const sidebar = (
    <>
      <Link href="/dashboard" className="inline-flex min-h-11 items-center px-2 no-underline">
        <Wordmark />
      </Link>
      <Button asChild>
        <Link href="/letters/new" className="no-underline">
          <Plus aria-hidden strokeWidth={2.4} />
          New letter
        </Link>
      </Button>
      <SidebarNav companyUsage={`${count ?? 0} of ${limit}`} isAdmin={profile?.role === "admin"} />
      <div className="mt-auto flex flex-col gap-2 border-t border-line-soft pt-4">
        <div className="flex min-w-0 items-center gap-2.5 px-2">
          <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-evergreen-50 text-sm font-semibold text-evergreen-700">
            {initials}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold">{name}</span>
            {profile?.full_name ? <span className="truncate text-xs text-muted">{user.email}</span> : null}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <form action={signOut}>
            <Button type="submit" variant="ghost" className="px-2 text-[13px]">
              <LogOut aria-hidden />
              Sign out
            </Button>
          </form>
          <Link href="/report-misuse" className="inline-flex min-h-11 items-center px-2 text-[13px] text-evergreen-600">
            Report misuse
          </Link>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-canvas" data-no-print>
      <aside className="sticky top-0 hidden h-screen w-[248px] min-w-0 shrink-0 flex-col gap-5 overflow-y-auto border-r border-line bg-white px-4 py-5 md:flex">
        {sidebar}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-1 border-b border-line bg-white px-2 py-1.5 md:hidden">
          <MobileNav>{sidebar}</MobileNav>
          <Link href="/dashboard" className="inline-flex min-h-11 items-center px-1 no-underline">
            <Wordmark />
          </Link>
          <span className="flex-1" />
          <Button asChild size="icon">
            <Link href="/letters/new" aria-label="New letter" className="no-underline">
              <Plus aria-hidden strokeWidth={2.4} />
            </Link>
          </Button>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">
          <div className="mx-auto max-w-[1120px]">{children}</div>
        </main>
      </div>
      <Toaster />
    </div>
  );
}
