import type { Metadata } from "next";
import { setStyleActive } from "@/app/admin/actions";
import { ToggleAction } from "@/components/admin/controls";
import { StyleForm } from "@/components/admin/forms";
import { AdminCard, AdminHeader, Pill } from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Letter styles" };

export default async function AdminStylesPage() {
  const supabase = await createClient();
  const { data: styles } = await supabase.from("templates").select("key, name, description, default_accent, active, sort_order").order("sort_order");
  const counts = await Promise.all(
    (styles ?? []).map(async (style) => [style.key, (await supabase.from("letters").select("id", { count: "exact", head: true }).eq("template_key", style.key)).count ?? 0] as const),
  );
  const used = (key: string) => counts.find(([k]) => k === key)?.[1] ?? 0;

  return (
    <>
      <AdminHeader title="Letter styles" description="The layouts themselves are part of the app; here you name them, set their default colour and order, and switch them on or off. Letters that use a style keep it when it’s switched off." />
      <div className="flex flex-col gap-4">
        {(styles ?? []).map((style) => (
          <AdminCard key={style.key}>
            <div className="mb-4 flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden className="size-9 shrink-0 rounded-lg border border-line" style={{ background: style.default_accent }} />
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">{style.name}</h2>
                  <p className="text-[13px] text-ink-2">
                    <span className="font-mono">{style.key}</span> · used by {used(style.key)} {used(style.key) === 1 ? "letter" : "letters"}
                  </p>
                </div>
                <Pill tone={style.active ? "success" : "outline"}>{style.active ? "On" : "Off"}</Pill>
              </div>
              <ToggleAction checked={style.active} label={`${style.name}: ${style.active ? "on" : "off"}`} action={setStyleActive.bind(null, style.key)} />
            </div>
            <StyleForm styleKey={style.key} name={style.name} description={style.description ?? ""} defaultAccent={style.default_accent} sortOrder={style.sort_order} />
          </AdminCard>
        ))}
      </div>
    </>
  );
}
