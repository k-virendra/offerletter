"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** A search field that puts the query in the address, so results can be linked and reloaded. */
export function SearchBox({ path, value, placeholder, label, extra = {} }: { path: string; value: string; placeholder: string; label: string; extra?: Record<string, string> }) {
  const router = useRouter();
  const [query, setQuery] = useState(value);
  return (
    <form
      role="search"
      className="relative w-full sm:w-[360px]"
      onSubmit={(event) => {
        event.preventDefault();
        const params = new URLSearchParams(extra);
        if (query.trim()) params.set("q", query.trim());
        router.push(`${path}${params.size ? `?${params}` : ""}`);
      }}
    >
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
      <input
        type="search"
        aria-label={label}
        value={query}
        placeholder={placeholder}
        onChange={(event) => setQuery(event.target.value)}
        className="h-11 w-full rounded-lg border border-control bg-white pr-3 pl-9 text-[15px] text-ink placeholder:text-muted"
      />
    </form>
  );
}
