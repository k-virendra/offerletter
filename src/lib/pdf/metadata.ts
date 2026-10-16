import { PDFDocument } from "pdf-lib";

export type PdfMetadata = { title: string; author: string; subject: string; keywords?: string[] };

/** Title, author, subject and language for the PDF. Chromium only sets the title, from the page's <title>. */
export async function withMetadata(pdf: Uint8Array, metadata: PdfMetadata, now = new Date()): Promise<Uint8Array> {
  const document = await PDFDocument.load(pdf, { updateMetadata: false });
  document.setTitle(metadata.title, { showInWindowTitleBar: true });
  document.setAuthor(metadata.author);
  document.setSubject(metadata.subject);
  if (metadata.keywords?.length) document.setKeywords(metadata.keywords);
  document.setCreator("Offer Letter PDF");
  document.setProducer("Offer Letter PDF (Chromium)");
  document.setCreationDate(now);
  document.setModificationDate(now);
  document.setLanguage("en");
  return document.save({ useObjectStreams: false });
}
