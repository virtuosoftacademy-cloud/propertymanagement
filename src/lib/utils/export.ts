/**
 * PropertyPro - Client-side list export helpers
 *
 * Shared CSV/PDF export used by dashboard list pages. Browser-only: relies on
 * Blob, URL.createObjectURL and a dynamically imported jsPDF, so only import
 * this from client components.
 */

export type ExportRow = Record<string, string>;

export interface PdfColumn {
  /** Key into the row object. */
  key: string;
  /** Column heading. */
  label: string;
  /** Column width in points. */
  width: number;
}

/** `prefix-YYYY-MM-DD.ext` */
export function exportFilename(prefix: string, extension: string): string {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Download rows as CSV.
 *
 * Escapes per RFC 4180 — every field is quoted and embedded quotes are
 * doubled — so commas, quotes and newlines inside descriptions cannot shift
 * columns. Prefixed with a UTF-8 BOM so Excel renders £ and other non-ASCII
 * characters correctly instead of mojibake.
 *
 * @returns the number of data rows written (0 if there was nothing to export)
 */
export function downloadCsv(rows: ExportRow[], filename: string): number {
  if (!rows.length) return 0;

  const escape = (value: unknown) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.map(escape).join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
  ].join("\r\n");

  triggerDownload(
    new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }),
    filename
  );
  return rows.length;
}

/**
 * Download rows as a landscape A4 PDF table.
 *
 * Repeats the header on each page and truncates each cell to its column width
 * so neighbouring columns can never overlap. Intended as a readable summary —
 * use the CSV when the full record is needed.
 *
 * @returns the number of data rows written (0 if there was nothing to export)
 */
export async function downloadPdf(
  rows: ExportRow[],
  columns: PdfColumn[],
  options: { title: string; filename: string; subtitle?: string }
): Promise<number> {
  if (!rows.length) return 0;

  const { default: JsPDF } = await import("jspdf");
  const pdf = new JsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 32;
  let y = margin;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text(options.title, margin, y);
  y += 16;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(
    options.subtitle ??
      `${rows.length} record(s) — generated ${new Date().toLocaleString("en-GB")}`,
    margin,
    y
  );
  y += 18;

  const drawHeader = () => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    let x = margin;
    for (const col of columns) {
      pdf.text(col.label, x, y);
      x += col.width;
    }
    y += 4;
    pdf.setLineWidth(0.5);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 10;
    pdf.setFont("helvetica", "normal");
  };

  drawHeader();

  for (const row of rows) {
    if (y > pageHeight - margin) {
      pdf.addPage();
      y = margin;
      drawHeader();
    }
    let x = margin;
    for (const col of columns) {
      const raw = String(row[col.key] ?? "");
      const text = pdf.splitTextToSize(raw, col.width - 6)[0] ?? "";
      pdf.text(text, x, y);
      x += col.width;
    }
    y += 14;
  }

  pdf.save(options.filename);
  return rows.length;
}
