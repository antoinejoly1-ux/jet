import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { flightFormOptions } from "@/components/admin/flight-options";
import { MaintenanceForm } from "@/components/admin/maintenance-form";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { planMaintenanceAction } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("maintenance"))("newTitle") };
}

export default async function NewMaintenancePage() {
  const viewer = await requireStaff();
  if (!can(viewer, "operations:write")) redirect("/admin/maintenance");
  const t = await getTranslations("maintenance");
  const { aircraft } = await flightFormOptions(viewer);
  return (
    <>
      <PageHeader title={t("newTitle")} description={t("newSubtitle")} />
      <MaintenanceForm action={planMaintenanceAction} aircraft={aircraft} />
    </>
  );
}
