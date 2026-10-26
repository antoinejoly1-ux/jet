import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { OwnerForm } from "@/components/admin/owner-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/services/errors";
import { getOwner } from "@/lib/services/owners";
import { updateOwnerAction } from "../../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("owners"))("editTitle") };
}

export default async function EditOwnerPage({ params }: PageProps<"/admin/owners/[id]/edit">) {
  const viewer = await requireStaff();
  const { id } = await params;
  const t = await getTranslations("owners");
  const detail = await getOwner(db, viewer, id).catch((e) =>
    e instanceof NotFoundError ? notFound() : Promise.reject(e),
  );
  return (
    <>
      <PageHeader title={t("editTitle")} description={detail.owner.legalName} />
      <OwnerForm action={updateOwnerAction.bind(null, id)} defaults={detail.owner} cancelHref={`/admin/owners/${id}`} />
    </>
  );
}
