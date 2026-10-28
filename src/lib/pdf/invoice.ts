/**
 * The holding company's invoice as a PDF, drawn from the stored invoice and
 * its lines (so the same invoice always prints the same). Letter size,
 * Helvetica. Labels arrive translated; this file only lays them out.
 */
import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { pdfSafe } from "./statement";

const W = 612;
const H = 792;
const M = 54;
const INK = rgb(0.043, 0.071, 0.125);
const MUTED = rgb(0.357, 0.392, 0.459);
const RULE = rgb(0.886, 0.898, 0.918);

export type InvoicePdf = {
  issuer: { name: string; lines: string[] };
  title: string;
  meta: [string, string][];
  billTo: { label: string; lines: string[] };
  flight: string | null;
  columns: [string, string, string, string];
  rows: [string, string, string, string][];
  totals: [string, string][];
  grandTotal: [string, string];
  notes: string[];
  footer: string;
};

export async function renderInvoicePdf(doc: InvoicePdf): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(pdfSafe(doc.title));
  pdf.setProducer("Univair Management");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([W, H]);
  let y = H - M;

  const width = (s: string, size: number, b = false) => (b ? bold : font).widthOfTextAtSize(pdfSafe(s), size);
  const text = (s: string, x: number, size = 10, b = false, color = INK) =>
    page.drawText(pdfSafe(s), { x, y, size, font: b ? bold : font, color });
  const right = (s: string, xRight: number, size = 10, b = false, color = INK) =>
    text(s, xRight - width(s, size, b), size, b, color);
  const rule = () => page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: RULE });
  const footer = () => page.drawText(pdfSafe(doc.footer), { x: M, y: M / 2, size: 8, font, color: MUTED });
  const ensure = (h: number) => {
    if (y - h > M + 20) return;
    footer();
    page = pdf.addPage([W, H]);
    y = H - M;
  };

  // Issuer, top left; the invoice's number and dates, top right.
  text(doc.issuer.name, M, 14, true);
  const top = y;
  y -= 16;
  for (const l of doc.issuer.lines) {
    text(l, M, 9, false, MUTED);
    y -= 12;
  }
  const afterIssuer = y;
  y = top;
  right(doc.title, W - M, 18, true);
  y -= 22;
  for (const [k, v] of doc.meta) {
    right(`${k}  ${v}`, W - M, 9, false, MUTED);
    y -= 12;
  }
  y = Math.min(y, afterIssuer) - 20;

  text(doc.billTo.label, M, 8, true, MUTED);
  y -= 13;
  for (const l of doc.billTo.lines) {
    text(l, M, 10, l === doc.billTo.lines[0]);
    y -= 13;
  }
  if (doc.flight) {
    y -= 6;
    text(doc.flight, M, 9, false, MUTED);
    y -= 13;
  }
  y -= 14;

  // Lines: description, quantity, unit price, amount.
  const xs = [M, M + 280, M + 360, W - M];
  const header = () => {
    text(doc.columns[0], xs[0]!, 8, true, MUTED);
    right(doc.columns[1], xs[1]! + 60, 8, true, MUTED);
    right(doc.columns[2], xs[2]! + 80, 8, true, MUTED);
    right(doc.columns[3], xs[3]!, 8, true, MUTED);
    y -= 6;
    rule();
    y -= 14;
  };
  header();
  for (const r of doc.rows) {
    ensure(16);
    text(r[0], xs[0]!, 9);
    right(r[1], xs[1]! + 60, 9);
    right(r[2], xs[2]! + 80, 9);
    right(r[3], xs[3]!, 9);
    y -= 15;
  }
  y -= 2;
  rule();
  y -= 16;
  for (const [k, v] of doc.totals) {
    ensure(16);
    right(k, xs[2]! + 80, 9, false, MUTED);
    right(v, xs[3]!, 9);
    y -= 14;
  }
  y -= 4;
  right(doc.grandTotal[0], xs[2]! + 80, 11, true);
  right(doc.grandTotal[1], xs[3]!, 11, true);
  y -= 30;

  for (const n of doc.notes) {
    ensure(14);
    text(n, M, 9, false, MUTED);
    y -= 13;
  }
  footer();
  return pdf.save();
}
