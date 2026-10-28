import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { InvoiceDetail } from "@/components/billing/invoice-detail";
import { PageHeader } from "@/components/ui/page-header";
import { ForbiddenError } from "@/lib/auth/policy";
import { requireAccess } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getInvoiceDetail } from "@/lib/services/billing";
import { NotFoundError } from "@/lib/services/errors";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("invoiceDetail"))("title") };
}

/** One invoice from the holding company, with its lines and the flight it bills. */
export default async function OwnerInvoicePage({ params }: PageProps<"/invoices/[id]">) {
  const viewer = await requireAccess();
  const { id } = await params;
  const t = await getTranslations("invoiceDetail");
  const detail = await getInvoiceDetail(db, viewer, id).catch((e) =>
    e instanceof NotFoundError || e instanceof ForbiddenError ? notFound() : Promise.reject(e),
  );
  return (
    <>
      <Link
        href="/invoices"
        className="text-muted hover:text-text mb-2 -ml-1 inline-flex h-11 items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader eyebrow={detail.invoice.issuer?.legalName} title={detail.invoice.number} />
      <InvoiceDetail detail={detail} locale={await getLocale()} />
    </>
  );
}
