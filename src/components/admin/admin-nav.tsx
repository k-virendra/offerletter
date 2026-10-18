"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type AdminNavItem = { href: string; label: string; count?: number; tone?: "marigold" | "danger"; countLabel?: string };

export function AdminNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin">
      <ul className="relative flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
        {items.map((item) => {
          const active = item.href === "/admin" ? pathname === "/admin" : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-[10px] px-3 text-[15px] whitespace-nowrap no-underline",
                  active ? "bg-white/12 font-semibold text-white" : "text-[#C9CED6] hover:bg-white/8 hover:text-white",
                )}
              >
                {item.label}
                {item.count ? (
                  <span
                    className={cn(
                      "ml-auto inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold",
                      item.tone === "danger" ? "bg-[#F4A6A0] text-[#5C1610]" : "bg-marigold-500 text-ink",
                    )}
                  >
                    <span className="sr-only">(</span>
                    {item.count}
                    <span className="sr-only">{` ${item.countLabel ?? (item.tone === "danger" ? "new" : "to review")})`}</span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
