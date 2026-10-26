import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AircraftForm } from "@/components/admin/aircraft-form";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getAircraft } from "@/lib/services/aircraft";
import { NotFoundError } from "@/lib/services/errors";
import { updateAircraftAction } from "../../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("aircraft"))("editTitle") };
}

export default async function EditAircraftPage({ params }: PageProps<"/admin/aircraft/[id]/edit">) {
  const viewer = await requireStaff();
  const { id } = await params;
  if (!can(viewer, "fleet:write")) redirect(`/admin/aircraft/${id}`);
  const t = await getTranslations("aircraft");
  const detail = await getAircraft(db, viewer, id).catch((e) =>
    e instanceof NotFoundError ? notFound() : Promise.reject(e),
  );
  return (
    <>
      <PageHeader title={t("editTitle")} description={detail.aircraft.registration} />
      <AircraftForm
        action={updateAircraftAction.bind(null, id)}
        defaults={detail.aircraft}
        cancelHref={`/admin/aircraft/${id}`}
      />
    </>
  );
}
