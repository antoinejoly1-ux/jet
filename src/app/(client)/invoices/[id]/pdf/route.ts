import { NextResponse, type NextRequest } from "next/server";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ForbiddenError } from "@/lib/auth/policy";
import { getViewer } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatHours, formatMoney } from "@/lib/format";
import { renderInvoicePdf } from "@/lib/pdf/invoice";
import { getInvoiceDetail } from "@/lib/services/billing";
import { NotFoundError } from "@/lib/services/errors";
import { OPERATOR_TIME_ZONE } from "@/lib/time";

/**
 * The PDF of a generated invoice, drawn from its stored lines: the owner,
 * finance and the company's managers may download it.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/invoices/[id]/pdf">) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.redirect(new URL("/sign-in", request.url));
  const { id } = await params;
  let detail;
  try {
    detail = await getInvoiceDetail(db, viewer, id);
  } catch (err) {
    if (err instanceof ForbiddenError || err instanceof NotFoundError) return new NextResponse(null, { status: 404 });
    throw err;
  }
  const locale = await getLocale();
  const t = await getTranslations("invoiceDetail");
  const tr = await getTranslations("rates");
  const tp = await getTranslations("pilot.form");
  const format = await getFormatter();
  const { invoice, lines, report } = detail;
  const cad = (c: number) => formatMoney(c, invoice.currency, locale);
  const day = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00`), { dateStyle: "long" });
  const issuer = invoice.issuer;

  const bytes = await renderInvoicePdf({
    issuer: {
      name: issuer?.legalName ?? "",
      lines: [
        ...(issuer?.address ? issuer.address.split("\n") : []),
        ...(issuer?.gstNumber ? [`${t("gst")} ${issuer.gstNumber}`] : []),
        ...(issuer?.qstNumber ? [`${t("qst")} ${issuer.qstNumber}`] : []),
      ],
    },
    title: t("pdfTitle"),
    meta: [
      [t("number"), invoice.number],
      [t("date"), day(invoice.issuedOn)],
      ...(invoice.dueOn ? ([[t("due"), day(invoice.dueOn)]] as [string, string][]) : []),
    ],
    billTo: { label: t("to"), lines: [detail.ownerName, `${detail.registration} · ${detail.model}`] },
    flight: report
      ? `${t("flight")} ${report.fromAirport} -> ${report.toAirport} · ${format.dateTime(report.departsAt, { dateStyle: "medium", timeZone: OPERATOR_TIME_ZONE })} · ${formatHours(report.flightMinutes, locale)}`
      : null,
    columns: [t("description"), t("quantity"), t("unitPrice"), t("amount")],
    rows: lines.map((l) =>
      l.kind === "hours"
        ? [tr(`parts.${l.part}`), formatHours(l.minutes ?? 0, locale), cad(l.unitCents ?? 0), cad(l.amountCents)]
        : [
            `${tp(`categories.${l.part}`)} (${t("atCost")})${l.description ? ` · ${l.description}` : ""}`,
            "",
            "",
            cad(l.amountCents),
          ],
    ),
    totals: [
      [t("subtotal"), cad(invoice.subtotalCents ?? invoice.totalCents)],
      ...(invoice.gstCents ? ([[t("gstLine"), cad(invoice.gstCents)]] as [string, string][]) : []),
      ...(invoice.qstCents ? ([[t("qstLine"), cad(invoice.qstCents)]] as [string, string][]) : []),
    ],
    grandTotal: [t("total"), cad(invoice.totalCents)],
    notes: [
      ...(issuer?.paymentInstructions ? [`${t("howToPay")} ${issuer.paymentInstructions}`] : []),
      ...(!issuer?.gstNumber && !issuer?.qstNumber ? [t("notRegistered")] : []),
      ...(invoice.status === "void" ? [t("voided", { reason: invoice.voidReason ?? "" })] : []),
    ],
    footer: `${issuer?.legalName ?? ""} · ${invoice.number} · ${t("managedBy")}`,
  });
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
