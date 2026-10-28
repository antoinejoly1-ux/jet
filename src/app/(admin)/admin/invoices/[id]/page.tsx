import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { InvoiceDetail } from "@/components/billing/invoice-detail";
import { PageHeader } from "@/components/ui/page-header";
import { InvoiceRowActions } from "@/components/admin/invoice-row-actions";
import { can, ForbiddenError } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getInvoiceDetail } from "@/lib/services/billing";
import { NotFoundError } from "@/lib/services/errors";
import { zonedDay } from "@/lib/time";
import { markPaidAction, voidInvoiceAction } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("invoiceDetail"))("title") };
}

/** A generated invoice, as the team sees it. */
export default async function AdminInvoicePage({ params }: PageProps<"/admin/invoices/[id]">) {
  const viewer = await requireStaff();
  const { id } = await params;
  const t = await getTranslations("invoiceDetail");
  const detail = await getInvoiceDetail(db, viewer, id).catch((e) =>
    e instanceof NotFoundError || e instanceof ForbiddenError ? notFound() : Promise.reject(e),
  );
  return (
    <>
      <Link
        href="/admin/invoices"
        className="text-muted hover:text-text mb-2 -ml-1 inline-flex h-11 items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader eyebrow={detail.invoice.issuer?.legalName} title={detail.invoice.number} />
      <InvoiceDetail
        detail={detail}
        locale={viewer.locale}
        actions={
          can(viewer, "finance:write") ? (
            <InvoiceRowActions
              status={detail.invoice.status}
              today={zonedDay(new Date())}
              markPaid={markPaidAction.bind(null, id)}
              voidAction={voidInvoiceAction.bind(null, id)}
            />
          ) : null
        }
      />
    </>
  );
}
