import { Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { financeOwnerIds } from "@/lib/auth/policy";
import type { Viewer } from "@/lib/auth/session";

/** Members who don't see any owner's finances (an assistant without that right). */
export const lacksFinanceAccess = (viewer: Viewer) => financeOwnerIds(viewer).length === 0;

/** What they see instead of an empty finance page, if they reach one by its address. */
export async function NoFinanceAccess({ title, staff = false }: { title: string; staff?: boolean }) {
  const t = await getTranslations("financeAccess");
  return (
    <>
      <PageHeader title={title} />
      <EmptyState icon={Lock} title={staff ? t("staffTitle") : t("title")} body={staff ? t("staffBody") : t("body")} />
    </>
  );
}
