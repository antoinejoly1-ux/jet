import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { InvoiceForm } from "@/components/admin/invoice-form";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listShareOptions } from "@/lib/services/invoices";
import { createInvoiceAction } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("invoices"))("newTitle") };
}

export default async function NewInvoicePage() {
  const viewer = await requireStaff();
  if (!can(viewer, "finance:write")) redirect("/admin/invoices");
  const t = await getTranslations("invoices");
  const format = await getFormatter();
  const shares = (await listShareOptions(db, viewer))
    .filter((s) => !s.ended)
    .map((s) => ({
      id: s.id,
      label: `${s.registration} · ${s.ownerName} (${format.number(s.percentageBp / 10000, { style: "percent", maximumFractionDigits: 2 })})`,
    }));
  return (
    <>
      <PageHeader title={t("newTitle")} description={t("newSubtitle")} />
      <InvoiceForm action={createInvoiceAction} shares={shares} />
    </>
  );
}
