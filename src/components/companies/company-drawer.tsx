"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { CompanyForm, type EditableCompany } from "@/components/companies/company-form";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import type { CountryOption } from "@/lib/countries";

/** The add and edit form as a side drawer over My companies. Its URL (?add=1, ?edit=<id>) can be linked to. */
export function CompanyDrawer({
  company,
  countries,
  footerNote,
  closeHref = "/companies",
  savedHref,
}: {
  company?: EditableCompany;
  countries: { launch: CountryOption[]; other: CountryOption[] };
  footerNote: string;
  closeHref?: string;
  /** Where to go after saving (defaults to closeHref), e.g. back to New letter with the company chosen. */
  savedHref?: (id: string) => string;
}) {
  const router = useRouter();
  const close = () => router.push(closeHref, { scroll: false });

  return (
    <Dialog.Root open onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/30" />
        <Dialog.Content
          aria-describedby="company-drawer-description"
          className="fixed inset-y-0 right-0 z-50 flex w-[640px] max-w-full flex-col bg-white shadow-[-12px_0_40px_rgb(20_24_31/0.18)] outline-none"
        >
          <header className="flex items-center gap-3 border-b border-line py-4.5 pr-5 pl-5 sm:pl-7">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-display text-[26px] leading-tight font-medium">
                {company ? "Edit company" : "Add company"}
              </Dialog.Title>
              <Dialog.Description id="company-drawer-description" className="mt-0.5 truncate text-sm text-ink-2">
                {company ? company.legal_name : "Saved to My companies, so every letter for it starts filled in."}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X aria-hidden />
              </Button>
            </Dialog.Close>
          </header>
          <CompanyForm
            company={company}
            countries={countries}
            footerNote={footerNote}
            onCancel={close}
            onSaved={(result) => {
              toast(company ? `Changes to ${result.name} saved.` : "Company saved. It will fill in on your next letter.");
              router.push(savedHref ? savedHref(result.id) : closeHref, { scroll: false });
            }}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
