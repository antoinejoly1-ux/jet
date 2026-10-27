/**
 * Renders the yearly statement as a PDF with pdf-lib (pure JavaScript, runs
 * in any serverless function). Letter size, Helvetica, paginated tables.
 * Labels arrive already translated; this file only lays things out.
 */
import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const PAGE = { width: 612, height: 792 }; // US Letter, the Canadian default
const MARGIN = 48;
const INK = rgb(0.043, 0.071, 0.125);
const MUTED = rgb(0.357, 0.392, 0.459);
const RULE = rgb(0.886, 0.898, 0.918);

/** Helvetica's encoding covers French accents but not narrow spaces or arrows: map those first. */
export function pdfSafe(text: string): string {
  return text
    .replace(/[   ]/g, " ")
    .replace(/→/g, "->")
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...")
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7e -ÿ]/g, "?");
}

export type Column = { label: string; width: number; align?: "left" | "right" };
export type Section =
  | { kind: "kv"; title: string; rows: [string, string][] }
  | { kind: "table"; title: string; columns: Column[]; rows: string[][]; empty: string; footer?: string[] };

export type StatementDocument = {
  title: string;
  subtitle: string;
  generated: string;
  footerNote: string;
  sections: Section[];
};

class Writer {
  page!: PDFPage;
  y = 0;
  pageNumber = 0;
  constructor(
    private doc: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont,
    private footer: string,
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.pageNumber++;
    this.y = PAGE.height - MARGIN;
    this.page.drawText(pdfSafe(`${this.footer} · ${this.pageNumber}`), {
      x: MARGIN,
      y: MARGIN / 2,
      size: 8,
      font: this.font,
      color: MUTED,
    });
  }

  ensure(height: number) {
    if (this.y - height < MARGIN) this.newPage();
  }

  text(value: string, opts: { x?: number; size?: number; bold?: boolean; color?: typeof INK; maxWidth?: number } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.font;
    let s = pdfSafe(value);
    if (opts.maxWidth && font.widthOfTextAtSize(s, size) > opts.maxWidth) {
      while (s.length > 1 && font.widthOfTextAtSize(`${s}...`, size) > opts.maxWidth) s = s.slice(0, -1);
      s = `${s.trimEnd()}...`;
    }
    this.page.drawText(s, { x: opts.x ?? MARGIN, y: this.y, size, font, color: opts.color ?? INK });
  }

  width(value: string, size: number, bold = false) {
    return (bold ? this.bold : this.font).widthOfTextAtSize(pdfSafe(value), size);
  }

  rule() {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE.width - MARGIN, y: this.y },
      thickness: 0.5,
      color: RULE,
    });
  }
}

export async function renderStatementPdf(doc: StatementDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(pdfSafe(doc.title));
  pdf.setProducer("Univair Management");
  pdf.setCreationDate(new Date());
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(pdf, font, bold, doc.footerNote);
  const contentWidth = PAGE.width - 2 * MARGIN;

  w.text("Univair Management", { size: 12, bold: true });
  w.y -= 26;
  w.text(doc.title, { size: 20, bold: true });
  w.y -= 18;
  w.text(doc.subtitle, { size: 11, color: MUTED });
  w.y -= 14;
  w.text(doc.generated, { size: 8, color: MUTED });
  w.y -= 24;

  for (const section of doc.sections) {
    w.ensure(60);
    w.text(section.title, { size: 12, bold: true });
    w.y -= 8;
    w.rule();
    w.y -= 14;

    if (section.kind === "kv") {
      for (const [k, v] of section.rows) {
        w.ensure(16);
        w.text(k, { color: MUTED });
        w.text(v, { x: PAGE.width - MARGIN - w.width(v, 10, true), bold: true });
        w.y -= 16;
      }
      w.y -= 12;
      continue;
    }

    const total = section.columns.reduce((n, c) => n + c.width, 0);
    const xs: number[] = [];
    let x = MARGIN;
    for (const c of section.columns) {
      xs.push(x);
      x += (c.width / total) * contentWidth;
    }
    const colWidth = (i: number) => (section.columns[i]!.width / total) * contentWidth - 6;
    const cell = (value: string, i: number, b = false, color = INK) => {
      const c = section.columns[i]!;
      const size = 9;
      const at = c.align === "right" ? xs[i]! + colWidth(i) - Math.min(w.width(value, size, b), colWidth(i)) : xs[i]!;
      w.text(value, { x: at, size, bold: b, color, maxWidth: colWidth(i) });
    };
    const header = () => {
      section.columns.forEach((c, i) => cell(c.label, i, true, MUTED));
      w.y -= 6;
      w.rule();
      w.y -= 12;
    };

    if (section.rows.length === 0) {
      w.text(section.empty, { size: 9, color: MUTED });
      w.y -= 24;
      continue;
    }
    header();
    for (const row of section.rows) {
      if (w.y - 14 < MARGIN) {
        w.newPage();
        header();
      }
      row.forEach((v, i) => cell(v, i));
      w.y -= 14;
    }
    if (section.footer) {
      w.ensure(20);
      w.rule();
      w.y -= 12;
      section.footer.forEach((v, i) => cell(v, i, true));
      w.y -= 14;
    }
    w.y -= 14;
  }
  return pdf.save();
}
