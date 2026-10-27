import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { HoldingCompanyForm } from "@/components/admin/holding-company-form";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/services/errors";
import { getHoldingCompany } from "@/lib/services/holding-companies";
import { updateHoldingCompanyAction } from "../../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("holdingCompanies"))("editTitle") };
}

export default async function EditHoldingCompanyPage({ params }: PageProps<"/admin/holding-companies/[id]/edit">) {
  const viewer = await requireStaff();
  const { id } = await params;
  if (!can(viewer, "owners:write")) redirect(`/admin/holding-companies/${id}`);
  const t = await getTranslations("holdingCompanies");
  const { company } = await getHoldingCompany(db, viewer, id).catch((e) =>
    e instanceof NotFoundError ? notFound() : Promise.reject(e),
  );
  return (
    <>
      <PageHeader title={t("editTitle")} description={company.legalName} />
      <HoldingCompanyForm
        action={updateHoldingCompanyAction.bind(null, id)}
        defaults={company}
        cancelHref={`/admin/holding-companies/${id}`}
      />
    </>
  );
}
