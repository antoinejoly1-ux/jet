import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MaintenanceForm } from "@/components/admin/maintenance-form";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/services/errors";
import { getMaintenance } from "@/lib/services/maintenance";
import { utcToZonedLocal } from "@/lib/time";
import { updateMaintenanceAction } from "../../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("maintenance"))("editTitle") };
}

export default async function EditMaintenancePage({ params }: PageProps<"/admin/maintenance/[id]/edit">) {
  const viewer = await requireStaff();
  if (!can(viewer, "operations:write")) redirect("/admin/maintenance");
  const { id } = await params;
  const t = await getTranslations("maintenance");
  const job = await getMaintenance(db, viewer, id).catch((e) =>
    e instanceof NotFoundError ? notFound() : Promise.reject(e),
  );
  if (job.status === "done" || job.status === "cancelled") redirect("/admin/maintenance");
  return (
    <>
      <PageHeader title={t("editTitle")} description={`${job.registration} · ${job.title}`} />
      <MaintenanceForm
        action={updateMaintenanceAction.bind(null, id)}
        aircraft={[]}
        defaults={{
          aircraftId: job.aircraftId,
          type: job.type,
          title: job.title,
          dueOn: job.dueOn ?? "",
          startsAt: job.startsAt ? utcToZonedLocal(job.startsAt) : "",
          endsAt: job.endsAt ? utcToZonedLocal(job.endsAt) : "",
          notes: job.notes ?? "",
        }}
      />
    </>
  );
}
