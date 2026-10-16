import { Toaster } from "@/components/ui/toast";
import { requireUser } from "@/lib/auth";

// Full-screen layouts for making a letter (New letter, the editor): their own top bars instead of the sidebar.
export default async function EditorLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <div data-no-print>
      {children}
      <Toaster />
    </div>
  );
}
