import { createClient } from "@supabase/supabase-js";
import { loadContent } from "./content";

// Upserts content/ into the database with the secret key. Safe to run repeatedly:
//   * countries keep their enabled switch and styles keep their active switch (admins own those),
//   * prices are added only when no identical row exists; plans only when their key is new (then admins own them),
//   * clauses: a new section/version is inserted as a draft; an existing draft is updated; an existing clause in
//     review or approved is never changed (edit the YAML with a new version number instead).
// Usage: pnpm seed   (reads .env.local)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (see .env.example).");
  process.exit(1);
}

const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

function fail(step: string, error: { message: string } | null): asserts error is null {
  if (error) {
    console.error(`${step}: ${error.message}`);
    process.exit(1);
  }
}

async function main() {
  const content = loadContent();

  const parentsFirst = [...content.jurisdictions].sort((a, b) => Number(Boolean(a.parent_code)) - Number(Boolean(b.parent_code)));
  for (const j of parentsFirst) {
    const { error } = await db.from("jurisdictions").upsert(
      {
        code: j.code,
        parent_code: j.parent_code ?? null,
        name: j.name,
        currency: j.currency,
        locale: j.locale,
        paper_size: j.paper_size,
        selectable: j.selectable ?? true,
        sort_order: j.sort_order,
        admin_notes: j.admin_notes ?? null,
        public_note: j.public_note ?? null,
      },
      { onConflict: "code" },
    );
    fail(`jurisdiction ${j.code}`, error);
  }
  console.log(`countries: ${content.jurisdictions.length}`);

  {
    const { error } = await db.from("templates").upsert(
      content.templates.map((t) => ({ key: t.key, name: t.name, description: t.description, default_accent: t.default_accent, sort_order: t.sort_order })),
      { onConflict: "key" },
    );
    fail("templates", error);
    console.log(`letter styles: ${content.templates.length}`);
  }

  {
    const { error } = await db.from("sections").upsert(
      content.sections.map((s) => ({
        key: s.key,
        default_title: s.default_title,
        default_order: s.default_order,
        short_title: s.short_title ?? null,
        always_included: s.always_included ?? false,
        show_heading: s.show_heading ?? true,
        varies_by_country: s.varies_by_country ?? false,
        help_text: s.help_text ?? null,
      })),
      { onConflict: "key" },
    );
    fail("sections", error);
    console.log(`sections: ${content.sections.length}`);
  }

  {
    const { error } = await db.from("field_definitions").upsert(
      content.fields.map((f) => ({
        key: f.key,
        section_key: f.section_key,
        label: f.label,
        type: f.type,
        required: f.required ?? false,
        options: f.options ?? null,
        validation: f.validation ?? {},
        help_text: f.help_text ?? null,
        placeholder: f.placeholder ?? null,
        default_value: f.default_value ?? null,
        sort_order: f.sort_order,
        jurisdictions: f.jurisdictions ?? null,
        jurisdiction_overrides: f.jurisdiction_overrides ?? {},
      })),
      { onConflict: "key" },
    );
    fail("fields", error);
    console.log(`fields: ${content.fields.length}`);
  }

  {
    const { data: existing, error } = await db.from("prices").select("product, purpose, currency, amount_minor");
    fail("read prices", error);
    let added = 0;
    for (const p of content.prices) {
      const present = existing.some(
        (e) => e.product === p.product && e.purpose === p.purpose && e.currency === p.currency && e.amount_minor === p.amount_minor,
      );
      if (present) continue;
      if (p.active) {
        const { error: deactivateError } = await db.from("prices").update({ active: false }).eq("product", p.product).eq("purpose", p.purpose);
        fail("deactivate old price", deactivateError);
      }
      const { error: insertError } = await db.from("prices").insert({ ...p, notes: p.notes ?? null });
      fail(`price ${p.purpose} ${p.currency}`, insertError);
      added += 1;
    }
    console.log(`prices: ${added} added`);
  }

  {
    const { data: existing, error } = await db.from("plans").select("key");
    fail("read plans", error);
    const fresh = content.plans.filter((plan) => !existing.some((e) => e.key === plan.key));
    if (fresh.length) {
      const { error: insertError } = await db.from("plans").insert(fresh.map((plan) => ({ ...plan, description: plan.description ?? null })));
      fail("plans", insertError);
    }
    console.log(`plans: ${fresh.length} added`);
  }

  {
    const wanted = [
      ...Object.entries(content.phrases.defaults).map(([key, text]) => ({ key, jurisdiction_code: null as string | null, text })),
      ...Object.entries(content.phrases.overrides).flatMap(([code, phrases]) =>
        Object.entries(phrases).map(([key, text]) => ({ key, jurisdiction_code: code as string | null, text })),
      ),
    ];
    const { data: existing, error } = await db.from("letter_phrases").select("id, key, jurisdiction_code").eq("language", "en");
    fail("read phrases", error);
    for (const phrase of wanted) {
      const current = existing.find((e) => e.key === phrase.key && e.jurisdiction_code === phrase.jurisdiction_code);
      const { error: writeError } = current
        ? await db.from("letter_phrases").update({ text: phrase.text }).eq("id", current.id)
        : await db.from("letter_phrases").insert({ ...phrase, language: "en" });
      fail(`phrase ${phrase.key}`, writeError);
    }
    console.log(`phrases: ${wanted.length}`);
  }

  let inserted = 0;
  let updated = 0;
  let kept = 0;
  for (const { file, content: clauseFile } of content.clauseFiles) {
    for (const clause of clauseFile.clauses) {
      const { data: current, error } = await db
        .from("clause_variants")
        .select("id, review_status")
        .eq("section_key", clause.section)
        .eq("jurisdiction_code", clauseFile.jurisdiction)
        .eq("language", clauseFile.language)
        .eq("version", clause.version)
        .maybeSingle();
      fail(`read clause ${file} ${clause.section}`, error);
      const row = {
        section_key: clause.section,
        jurisdiction_code: clauseFile.jurisdiction,
        language: clauseFile.language,
        version: clause.version,
        title: clause.title ?? null,
        body: clause.body.trim(),
        locked: clause.locked,
        locked_reason: clause.locked_reason ?? null,
        editor_help: clause.editor_help ?? null,
        legal_notes: clause.legal_notes ?? null,
        source_file: file,
      };
      if (!current) {
        const { error: insertError } = await db.from("clause_variants").insert(row);
        fail(`insert clause ${file} ${clause.section}`, insertError);
        inserted += 1;
      } else if (current.review_status === "draft") {
        const { error: updateError } = await db.from("clause_variants").update(row).eq("id", current.id);
        fail(`update clause ${file} ${clause.section}`, updateError);
        updated += 1;
      } else {
        kept += 1;
      }
    }
  }
  console.log(`clauses: ${inserted} added, ${updated} drafts updated, ${kept} reviewed left as they are`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
