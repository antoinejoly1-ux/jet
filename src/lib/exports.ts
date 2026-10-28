/**
 * Turns service results into downloadable files: CSV tables and the yearly
 * statement PDF, in the reader's language. Route handlers call these after
 * the service has checked access.
 */
import "server-only";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { centsToAmount, minutesToHours, toCsv, type Cell, type CsvLocale } from "@/lib/csv";
import { formatHoursDecimal, formatMoney } from "@/lib/format";
import { renderStatementPdf, type Section } from "@/lib/pdf/statement";
import type { AnnualStatement } from "@/lib/services/statements";
import { utcToZonedLocal } from "@/lib/time";
import { lang } from "@/lib/locale";

async function context() {
  const locale: CsvLocale = lang(await getLocale());
  const t = await getTranslations("exports");
  return { locale, t };
}

const localTime = (d: Date) => utcToZonedLocal(d).replace("T", " ");

type TransactionRow = {
  occurredOn: string;
  registration?: string;
  ownerName?: string | null;
  kind: string;
  amountCents: number;
  currency: string;
  categoryFr: string | null;
  categoryEn: string | null;
  description: string | null;
  reversesId: string | null;
};

export async function transactionsCsv(rows: TransactionRow[], { withOwner = false } = {}) {
  const { locale, t } = await context();
  const header: Cell[] = [
    t("date"),
    t("aircraft"),
    ...(withOwner ? [t("owner")] : []),
    t("kind"),
    t("category"),
    t("description"),
    t("amount"),
    t("currency"),
    t("reversal"),
  ];
  return toCsv(
    [
      header,
      ...rows.map((r) => [
        r.occurredOn,
        r.registration ?? "",
        ...(withOwner ? [r.ownerName ?? ""] : []),
        t(`kinds.${r.kind}`),
        (locale === "en" ? r.categoryEn : r.categoryFr) ?? "",
        r.description ?? "",
        centsToAmount(r.amountCents),
        r.currency,
        r.reversesId ? t("yes") : "",
      ]),
    ],
    locale,
  );
}

type InvoiceRow = {
  number: string;
  issuedOn: string;
  dueOn: string | null;
  registration: string;
  ownerName?: string;
  totalCents: number;
  currency: string;
  status: string;
};

export async function invoicesCsv(rows: InvoiceRow[], { withOwner = false } = {}) {
  const { locale, t } = await context();
  return toCsv(
    [
      [
        t("number"),
        t("issuedOn"),
        t("dueOn"),
        t("aircraft"),
        ...(withOwner ? [t("owner")] : []),
        t("amount"),
        t("currency"),
        t("status"),
      ],
      ...rows.map((r) => [
        r.number,
        r.issuedOn,
        r.dueOn ?? "",
        r.registration,
        ...(withOwner ? [r.ownerName ?? ""] : []),
        centsToAmount(r.totalCents),
        r.currency,
        t(`invoiceStatuses.${r.status}`),
      ]),
    ],
    locale,
  );
}

type FlightRow = {
  departsAt: Date;
  arrivesAt: Date | null;
  registration: string;
  ownerName?: string | null;
  fromAirport: string;
  toAirport: string;
  flightMinutes: number | null;
  status: string;
};

export async function flightsCsv(rows: FlightRow[], { withOwner = false } = {}) {
  const { locale, t } = await context();
  return toCsv(
    [
      [
        t("departure"),
        t("arrival"),
        t("aircraft"),
        ...(withOwner ? [t("owner")] : []),
        t("from"),
        t("to"),
        t("flightHours"),
        t("status"),
      ],
      ...rows.map((r) => [
        localTime(r.departsAt),
        r.arrivesAt ? localTime(r.arrivesAt) : "",
        r.registration,
        ...(withOwner ? [r.ownerName ?? ""] : []),
        r.fromAirport,
        r.toAirport,
        r.flightMinutes ? minutesToHours(r.flightMinutes) : null,
        t(`flightStatuses.${r.status}`),
      ]),
    ],
    locale,
  );
}

/** The yearly statement as a PDF. */
export async function statementPdf(s: AnnualStatement) {
  const { locale, t } = await context();
  const format = await getFormatter();
  const money = (cents: number) => formatMoney(cents, s.currency, locale);
  const hours = (minutes: number) => formatHoursDecimal(minutes, locale);
  const day = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00`), { dateStyle: "medium" });
  const category = (r: { nameFr: string; nameEn: string }) => (locale === "en" ? r.nameEn : r.nameFr);

  const sections: Section[] = [
    {
      kind: "kv",
      title: t("statement.summary"),
      rows: [
        [
          t("statement.planned"),
          s.budgetPublished || s.totals.plannedCents ? money(s.totals.plannedCents) : t("statement.notPublished"),
        ],
        [t("statement.spent"), money(s.totals.spentCents)],
        ...(s.totals.revenueCents ? [[t("statement.revenue"), money(s.totals.revenueCents)] as [string, string]] : []),
        ...(s.totals.paymentsCents
          ? [[t("statement.payments"), money(s.totals.paymentsCents)] as [string, string]]
          : []),
        [t("statement.hoursOpening"), hours(s.hours.openingMinutes)],
        [t("statement.hoursPurchased"), hours(s.hours.purchasedMinutes)],
        [t("statement.hoursFlown"), hours(s.hours.flownMinutes)],
        ...(s.hours.adjustedMinutes
          ? [[t("statement.hoursAdjusted"), hours(s.hours.adjustedMinutes)] as [string, string]]
          : []),
        [t("statement.hoursClosing"), hours(s.hours.closingMinutes)],
      ],
    },
    {
      kind: "table",
      title: t("statement.byCategory"),
      empty: t("statement.none"),
      columns: [
        { label: t("category"), width: 3 },
        { label: t("statement.planned"), width: 2, align: "right" },
        { label: t("statement.spent"), width: 2, align: "right" },
        { label: t("statement.remaining"), width: 2, align: "right" },
      ],
      rows: s.categories.map((r) => [
        category(r),
        r.plannedCents ? money(r.plannedCents) : "-",
        money(r.spentCents),
        r.plannedCents ? money(r.plannedCents - r.spentCents) : "-",
      ]),
      footer: [
        t("statement.total"),
        s.totals.plannedCents ? money(s.totals.plannedCents) : "-",
        money(s.totals.spentCents),
        s.totals.plannedCents ? money(s.totals.plannedCents - s.totals.spentCents) : "-",
      ],
    },
    {
      kind: "table",
      title: t("statement.entries"),
      empty: t("statement.none"),
      columns: [
        { label: t("date"), width: 2 },
        { label: t("kind"), width: 2 },
        { label: t("category"), width: 2.5 },
        { label: t("description"), width: 4 },
        { label: t("amount"), width: 2, align: "right" },
      ],
      rows: s.entries.map((e) => [
        day(e.occurredOn),
        t(`kinds.${e.kind}`),
        (locale === "en" ? e.categoryEn : e.categoryFr) ?? "",
        `${e.reversesId ? `${t("reversal")}: ` : ""}${e.description ?? ""}`,
        money(e.amountCents),
      ]),
    },
    {
      kind: "table",
      title: t("statement.hours"),
      empty: t("statement.none"),
      columns: [
        { label: t("date"), width: 2 },
        { label: t("kind"), width: 2 },
        { label: t("description"), width: 5 },
        { label: t("hours"), width: 1.5, align: "right" },
      ],
      rows: s.hours.entries.map((h) => [
        format.dateTime(h.createdAt, { dateStyle: "medium" }),
        t(`hourKinds.${h.kind}`),
        h.fromAirport ? `${h.fromAirport} -> ${h.toAirport}` : (h.note ?? ""),
        hours(h.minutes),
      ]),
    },
    {
      kind: "table",
      title: t("statement.invoices"),
      empty: t("statement.none"),
      columns: [
        { label: t("number"), width: 2.5 },
        { label: t("issuedOn"), width: 2 },
        { label: t("status"), width: 2 },
        { label: t("amount"), width: 2, align: "right" },
      ],
      rows: s.invoices.map((i) => [i.number, day(i.issuedOn), t(`invoiceStatuses.${i.status}`), money(i.totalCents)]),
    },
  ];

  return renderStatementPdf({
    title: t("statement.title", { year: s.year }),
    subtitle: `${s.share.ownerName} · ${s.share.registration} (${s.share.model}) · ${format.number(s.share.percentageBp / 10000, { style: "percent", maximumFractionDigits: 2 })}`,
    generated: t("statement.generated", { date: format.dateTime(new Date(), { dateStyle: "long" }) }),
    footerNote: t("statement.footer"),
    sections,
  });
}

export function pdfResponse(bytes: Uint8Array, filename: string): Response {
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
