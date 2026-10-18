"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { requestCancellation } from "@/app/(editor)/website/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";

export function CancelButton({ subscriptionId }: { subscriptionId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <Button variant="ghost" className="text-danger" onClick={() => setOpen(true)}>
        Ask to cancel
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Ask to cancel your website?"
        description="Our team will contact you to confirm, and to help you keep your domain if you want to. Your website and email keep working until then."
        confirmLabel="Ask to cancel"
        pendingLabel="Sending…"
        pending={pending}
        onConfirm={() =>
          start(async () => {
            const result = await requestCancellation(subscriptionId);
            toast(result.message);
            setOpen(false);
            router.refresh();
          })
        }
      />
    </>
  );
}
