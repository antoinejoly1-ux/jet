import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { InvoicePreview } from "@/components/billing/invoice-preview";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ForbiddenError } from "@/lib/auth/policy";
import { requireAccess } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError } from "@/lib/services/errors";
import { previewInvoice } from "@/lib/services/billing";
import { issueInvoiceAction } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("billing"))("prepareTitle") };
}

/** The invoice a flight makes, checked before it's issued in the company's name. */
export default async function PrepareInvoicePage({ params }: PageProps<"/billing/[reportId]">) {
  const viewer = await requireAccess();
  const { reportId } = await params;
  const t = await getTranslations("billing");
  const draft = await previewInvoice(db, viewer, reportId).catch((e) =>
    e instanceof NotFoundError || e instanceof ForbiddenError || e instanceof ConflictError
      ? notFound()
      : Promise.reject(e),
  );
  if (draft.report.invoiceId) redirect(`/invoices/${draft.report.invoiceId}`);
  if (draft.report.status !== "approved") notFound();
  return (
    <>
      <Link
        href="/billing"
        className="text-muted hover:text-text mb-2 -ml-1 inline-flex h-11 items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {t("title")}
      </Link>
      <PageHeader
        eyebrow={draft.registration}
        title={`${draft.flight.fromAirport} → ${draft.flight.toAirport}`}
        description={t("prepareBody")}
      />
      <Card className="max-w-2xl">
        <InvoicePreview
          draft={draft}
          locale={await getLocale()}
          issue={viewer.viewingAs ? null : issueInvoiceAction.bind(null, reportId)}
        />
      </Card>
    </>
  );
}
