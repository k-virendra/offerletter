// A letter that hasn't been paid for is only ever shown with a watermark: in the editor's live preview and in
// preview PDFs. Issued letters have none.

const PREVIEW_WATERMARK: Record<string, string> = {
  en: "Preview – not valid",
  de: "Vorschau – nicht gültig",
  nl: "Voorbeeld – niet geldig",
};

/** The watermark for a preview in the letter's language. */
export function previewWatermark(language = "en"): string {
  return PREVIEW_WATERMARK[language] ?? PREVIEW_WATERMARK.en!;
}
