import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={cn("shrink-0", className)}>
      <rect width="32" height="32" rx="8" fill="#0F6E5F" />
      <path d="M10 7h8.5L23 11.5V25H10z" fill="#FFFFFF" />
      <path d="M18.5 7v4.5H23" fill="none" stroke="#0F6E5F" strokeWidth="1.5" />
      <circle cx="21" cy="22" r="4" fill="#F0B43C" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="font-display text-xl font-medium text-ink">{BRAND.name}</span>
    </span>
  );
}
