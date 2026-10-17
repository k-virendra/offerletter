"use client";

import { useRouter } from "next/navigation";

export function PeriodSelect({ value, options }: { value: string; options: { key: string; label: string }[] }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2.5 text-sm text-ink-2">
      Period
      <select
        value={value}
        onChange={(event) => router.push(`/admin?period=${event.target.value}`)}
        className="h-11 rounded-lg border border-control bg-white px-2.5 text-[15px] text-ink"
      >
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
