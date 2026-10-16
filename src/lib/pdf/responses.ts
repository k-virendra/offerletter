// PDF links open in a new tab, so problems are answered with a small readable page rather than JSON.

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function messagePage(status: number, title: string, body: string): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escape(title)}</title>
<style>body{margin:0;font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;color:#14181F;background:#F7F7F4}main{max-width:520px;margin:15vh auto;padding:0 20px}h1{font-size:24px;margin:0 0 8px}p{margin:0;color:#3D4451}</style>
</head><body><main><h1>${escape(title)}</h1><p>${escape(body)}</p></main></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "x-robots-tag": "noindex" } });
}

/** A file name people can recognise: "Offer letter – Lena Hoffmann (preview).pdf", without unsafe characters. */
export function pdfFileName(base: string): string {
  const cleaned = base.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "Offer letter";
  return `${cleaned}.pdf`;
}

export function contentDisposition(kind: "inline" | "attachment", fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
