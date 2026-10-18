"use client";

import { Building2, FileText, Globe, Settings, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function SidebarNav({ companyUsage, isAdmin }: { companyUsage: string; isAdmin: boolean }) {
  const pathname = usePathname();
  const items = [
    { href: "/dashboard", label: "Letters", icon: FileText, match: ["/dashboard", "/letters"] },
    { href: "/website", label: "Website", icon: Globe, match: ["/website"] },
    { href: "/companies", label: "My companies", icon: Building2, match: ["/companies"], meta: companyUsage },
    { href: "/settings", label: "Settings", icon: Settings, match: ["/settings"] },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: ShieldCheck, match: ["/admin"] }] : []),
  ];
  return (
    <nav aria-label="App">
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const active = item.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-[10px] px-3 text-[15px] no-underline",
                  active ? "bg-evergreen-50 font-semibold text-evergreen-700" : "font-medium text-ink-2 hover:bg-ghost-hover hover:text-ink",
                )}
              >
                <Icon aria-hidden className="size-[18px]" />
                {item.label}
                {"meta" in item && item.meta ? <span className="ml-auto text-xs font-normal">{item.meta}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
