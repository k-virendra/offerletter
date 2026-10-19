"use client";

import { Loader2, Plus } from "lucide-react";
import { Dialog } from "radix-ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createClauseVersion } from "@/app/admin/clauses/actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";

export function ClauseFilters({
  countries,
  country,
  status,
  languages,
  language,
}: {
  countries: { code: string; label: string }[];
  country: string;
  status: string;
  /** English, and the country's own language when its letters also come translated. */
  languages: { code: string; label: string }[];
  language: string;
}) {
  const router = useRouter();
  const go = (next: { country?: string; status?: string; lang?: string }) =>
    router.push(
      `/admin/clauses?${new URLSearchParams({ country: next.country ?? country, status: next.status ?? status, lang: next.country && next.country !== country ? "en" : (next.lang ?? language) })}`,
    );
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Country
        <Select value={country} onChange={(e) => go({ country: e.target.value })}>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Status
        <Select value={status} onChange={(e) => go({ status: e.target.value })}>
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="in_review">In review</option>
          <option value="approved">Approved</option>
        </Select>
      </label>
      {languages.length > 1 ? (
        <label className="col-span-2 flex flex-col gap-1.5 text-sm font-medium">
          Language
          <Select value={language} onChange={(e) => go({ lang: e.target.value })}>
            {languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.code === "en" ? l.label : `${l.label} translation`}
              </option>
            ))}
          </Select>
        </label>
      ) : null}
    </div>
  );
}

/** Starts a clause for a section this country has no wording of its own for yet. */
export function NewClauseButton({ country, language, sections }: { country: string; language: string; sections: { key: string; title: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState(sections[0]?.key ?? "");
  const [pending, start] = useTransition();
  const create = () =>
    start(async () => {
      const result = await createClauseVersion(section, country, language);
      if (!result.ok) return toast(result.message);
      setOpen(false);
      toast("Draft created.");
      router.push(`/admin/clauses?${new URLSearchParams({ country, status: "all", lang: language, id: result.id })}`);
    });

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button disabled={!sections.length} title={sections.length ? undefined : "Every section already has wording for this country. Start a new version from a clause instead."}>
          <Plus aria-hidden />
          New clause variant
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex w-[min(480px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-2xl bg-white p-7 shadow-popover">
          <Dialog.Title className="font-display text-[26px] leading-tight font-medium">New clause for {country}</Dialog.Title>
          <Dialog.Description className="text-[15px] text-ink-2">
            It starts as a draft. Until it’s approved, letters for {country} keep using a parent country’s wording, if there is one.
          </Dialog.Description>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Section
            <Select value={section} onChange={(e) => setSection(e.target.value)}>
              {sections.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.title}
                </option>
              ))}
            </Select>
          </label>
          <div className="flex flex-wrap justify-end gap-2.5">
            <Dialog.Close asChild>
              <Button variant="outline">Cancel</Button>
            </Dialog.Close>
            <Button onClick={create} disabled={pending || !section}>
              {pending ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : null}
              Create draft
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
