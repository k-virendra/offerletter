"use client";

import { Archive, ArchiveRestore, Ellipsis, FilePlus, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { useState, useTransition } from "react";
import { archiveCompany, deleteCompany, restoreCompany } from "@/app/(app)/companies/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export type CompanyActionTarget = {
  id: string;
  name: string;
  paid: number;
  drafts: number;
  archived: boolean;
  suspended: boolean;
  limit: number;
};

function useCompanyActions(company: CompanyActionTarget) {
  const [pending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const restore = () =>
    startTransition(async () => {
      const result = await restoreCompany(company.id);
      toast(result.ok ? `${result.name} is back in use.` : result.message);
    });

  const archive = () =>
    startTransition(async () => {
      const result = await archiveCompany(company.id);
      if (!result.ok) return toast(result.message);
      toast(`${result.name} archived. It can’t be used for new letters.`, {
        label: "Undo",
        altText: `Restore ${result.name}`,
        onClick: () => void restoreCompany(company.id),
      });
    });

  const remove = () =>
    startTransition(async () => {
      const result = await deleteCompany(company.id);
      setConfirmingDelete(false);
      toast(result.ok ? `${result.name} deleted. One company place is free again.` : result.message);
    });

  const deleteDialog = (
    <ConfirmDialog
      open={confirmingDelete}
      onOpenChange={setConfirmingDelete}
      title={`Delete ${company.name}?`}
      description={`This company has no paid letters, so it can be deleted.${
        company.drafts ? ` Its ${company.drafts === 1 ? "draft is" : `${company.drafts} drafts are`} deleted too.` : ""
      } This frees one of your ${company.limit} company places and can’t be undone.`}
      confirmLabel={company.drafts ? "Delete company and drafts" : "Delete company"}
      pending={pending}
      onConfirm={remove}
    />
  );

  return { pending, archive, restore, askToDelete: () => setConfirmingDelete(true), deleteDialog };
}

const itemClass =
  "flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 text-left text-sm font-medium outline-none data-[highlighted]:bg-ghost-hover data-[disabled]:cursor-not-allowed data-[disabled]:text-muted";

/** The "More actions" menu on a company card. On phones it also holds New letter and Edit. */
export function CompanyMenu({ company }: { company: CompanyActionTarget }) {
  const actions = useCompanyActions(company);
  const canStartLetters = !company.archived && !company.suspended;

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`More actions for ${company.name}`}
            disabled={actions.pending}
            className="data-[state=open]:border data-[state=open]:border-evergreen-600 data-[state=open]:bg-hover-soft"
          >
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            aria-label={`Actions for ${company.name}`}
            className="z-30 w-[300px] max-w-[calc(100vw-32px)] rounded-xl border border-line bg-white p-1.5 shadow-popover"
          >
            {canStartLetters ? (
              <DropdownMenu.Item asChild className={cn(itemClass, "sm:hidden")}>
                <Link href={`/letters/new?company=${company.id}`} className="text-ink no-underline">
                  <FilePlus aria-hidden className="size-4" />
                  New letter for this company
                </Link>
              </DropdownMenu.Item>
            ) : null}
            <DropdownMenu.Item asChild className={cn(itemClass, "sm:hidden")}>
              <Link href={`/companies?edit=${company.id}`} scroll={false} className="text-ink no-underline">
                <Pencil aria-hidden className="size-4" />
                Edit details
              </Link>
            </DropdownMenu.Item>
            {company.archived ? (
              <DropdownMenu.Item className={itemClass} onSelect={actions.restore}>
                <ArchiveRestore aria-hidden className="size-4" />
                Restore company
              </DropdownMenu.Item>
            ) : (
              <DropdownMenu.Item className={itemClass} onSelect={actions.archive}>
                <Archive aria-hidden className="size-4" />
                Archive company
              </DropdownMenu.Item>
            )}
            <DropdownMenu.Item
              className={cn(itemClass, "items-start py-2.5")}
              disabled={company.paid > 0}
              onSelect={actions.askToDelete}
            >
              <Trash2 aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span className="flex flex-col gap-0.5">
                Delete company
                <span className="text-xs font-normal text-muted">
                  {company.paid > 0
                    ? "Not available: it has paid letters. Archive it instead."
                    : "No paid letters, so it can be deleted. Frees a place."}
                </span>
              </span>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {actions.deleteDialog}
    </>
  );
}

export function RestoreButton({ company }: { company: CompanyActionTarget }) {
  const actions = useCompanyActions(company);
  return (
    <Button variant="secondary" disabled={actions.pending} onClick={actions.restore}>
      <ArchiveRestore aria-hidden />
      Restore
    </Button>
  );
}

export function DeleteButton({ company }: { company: CompanyActionTarget }) {
  const actions = useCompanyActions(company);
  return (
    <>
      <Button variant="danger-outline" disabled={actions.pending} onClick={actions.askToDelete} aria-label={`Delete ${company.name}`}>
        Delete…
      </Button>
      {actions.deleteDialog}
    </>
  );
}
