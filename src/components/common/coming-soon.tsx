import type { LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

/** A real route with its final title, holding the place of a screen built in a later phase. */
export async function ComingSoon({ titleKey, icon, phase }: { titleKey: string; icon: LucideIcon; phase: number }) {
  const t = await getTranslations();
  return (
    <>
      <PageHeader title={t(titleKey)} />
      <EmptyState icon={icon} title={t("comingSoon.title")} body={t("comingSoon.body", { phase })} />
    </>
  );
}
