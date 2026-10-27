import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AircraftForm } from "@/components/admin/aircraft-form";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listHoldingCompanyOptions } from "@/lib/services/holding-companies";
import { createAircraftAction } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("aircraft"))("newTitle") };
}

export default async function NewAircraftPage() {
  const viewer = await requireStaff();
  if (!can(viewer, "fleet:write")) redirect("/admin/aircraft");
  const t = await getTranslations("aircraft");
  return (
    <>
      <PageHeader title={t("newTitle")} description={t("newSubtitle")} />
      <AircraftForm
        action={createAircraftAction}
        cancelHref="/admin/aircraft"
        holdingCompanies={await listHoldingCompanyOptions(db, viewer)}
      />
    </>
  );
}
