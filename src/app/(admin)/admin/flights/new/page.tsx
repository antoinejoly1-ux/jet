import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { flightFormOptions } from "@/components/admin/flight-options";
import { FlightForm } from "@/components/admin/flight-form";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { scheduleFlightAction } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("flights"))("newTitle") };
}

export default async function NewFlightPage() {
  const viewer = await requireStaff();
  if (!can(viewer, "operations:write")) redirect("/admin/flights");
  const t = await getTranslations("flights");
  const options = await flightFormOptions(viewer);
  return (
    <>
      <PageHeader title={t("newTitle")} description={t("newSubtitle")} />
      <FlightForm action={scheduleFlightAction} {...options} />
    </>
  );
}
