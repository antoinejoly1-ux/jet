import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { HoldingCompanyForm } from "@/components/admin/holding-company-form";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { createHoldingCompanyAction } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("holdingCompanies"))("newTitle") };
}

export default async function NewHoldingCompanyPage() {
  const viewer = await requireStaff();
  if (!can(viewer, "owners:write")) redirect("/admin/holding-companies");
  const t = await getTranslations("holdingCompanies");
  return (
    <>
      <PageHeader title={t("newTitle")} description={t("newSubtitle")} />
      <HoldingCompanyForm action={createHoldingCompanyAction} cancelHref="/admin/holding-companies" />
    </>
  );
}
