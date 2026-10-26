import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OwnerForm } from "@/components/admin/owner-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaff } from "@/lib/auth/session";
import { createOwnerAction } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("owners"))("newTitle") };
}

export default async function NewOwnerPage() {
  await requireStaff();
  const t = await getTranslations("owners");
  return (
    <>
      <PageHeader title={t("newTitle")} description={t("newSubtitle")} />
      <OwnerForm action={createOwnerAction} cancelHref="/admin/owners" />
    </>
  );
}
