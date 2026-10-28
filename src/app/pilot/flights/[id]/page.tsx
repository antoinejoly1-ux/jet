import { ChevronLeft, CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ReportForm } from "@/components/pilot/report-form";
import { Badge } from "@/components/ui/badge";
import { requirePilot } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatHours, formatMoney } from "@/lib/format";
import { getFlightForReport } from "@/lib/services/flight-reports";
import { NotFoundError } from "@/lib/services/errors";
import { OPERATOR_TIME_ZONE } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("pilot"))("reportTitle") };
}

/** "2 h 15" from minutes, in the form the flight-time field reads back. */
const asTyped = (minutes: number) => `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;

export default async function PilotFlightPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requirePilot();
  const { id } = await params;
  const t = await getTranslations("pilot");
  const format = await getFormatter();
  const locale = await getLocale();
  const data = await getFlightForReport(db, viewer, id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const { flight, report, expenses } = data;
  const editable =
    !report || report.status === "returned" || (report.status === "submitted" && report.pilotUserId === viewer.id);
  const when = format.dateTime(flight.departsAt, {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone: OPERATOR_TIME_ZONE,
  });

  return (
    <>
      <Link href="/pilot" className="text-muted hover:text-text -ml-1 inline-flex h-11 items-center gap-1 text-sm">
        <ChevronLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <header className="mt-2 mb-8">
        <p className="eyebrow">
          {flight.registration} · {flight.model}
        </p>
        <h1 className="mt-2 text-4xl font-light tracking-tight">
          {flight.fromAirport} → {flight.toAirport}
        </h1>
        <p className="text-muted mt-2 text-sm first-letter:uppercase">{when}</p>
        {report ? (
          <div className="mt-4">
            <Badge
              tone={report.status === "approved" ? "success" : report.status === "returned" ? "warning" : "accent"}
            >
              {t(`statuses.${report.status}`)}
            </Badge>
          </div>
        ) : null}
      </header>

      {report?.status === "returned" && report.reviewNote ? (
        <p
          role="note"
          className="border-warning/30 bg-warning/8 text-warning mb-8 flex gap-2 rounded-lg border p-4 text-sm"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold">{t("returnedNote")}</strong> {report.reviewNote}
          </span>
        </p>
      ) : null}

      {editable ? (
        <ReportForm
          flightId={flight.id}
          initial={{
            flightTime: report
              ? asTyped(report.flightMinutes)
              : flight.flightMinutes
                ? asTyped(flight.flightMinutes)
                : "",
            fuelLitres: report?.fuelLitres != null ? String(report.fuelLitres) : "",
            notes: report?.notes ?? "",
            expenses: expenses.map((e) => ({
              key: e.id,
              category: e.category,
              amount: (e.amountCents / 100).toFixed(2).replace(".", locale.startsWith("fr") ? "," : "."),
              paidBy: e.paidBy,
              receiptFileId: e.receiptFileId ?? "",
              note: e.note ?? "",
            })),
          }}
        />
      ) : (
        <dl className="border-border bg-surface divide-border divide-y rounded-lg border text-sm">
          <div className="flex justify-between gap-4 px-5 py-4">
            <dt className="text-muted">{t("form.flightTime")}</dt>
            <dd className="font-medium">{formatHours(report!.flightMinutes, locale)}</dd>
          </div>
          {expenses.map((e) => (
            <div key={e.id} className="flex justify-between gap-4 px-5 py-4">
              <dt className="text-muted">{t(`form.categories.${e.category}`)}</dt>
              <dd className="font-medium">{formatMoney(e.amountCents, "CAD", locale)}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}
