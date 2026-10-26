import { Upload } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { ImportWizard } from "@/components/admin/import-wizard";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listImports } from "@/lib/services/imports";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("imports") };
}

export default async function ImportsPage() {
  const viewer = await requireStaff();
  const t = await getTranslations("imports");
  if (!can(viewer, "finance:write")) {
    return (
      <>
        <PageHeader title={t("title")} />
        <EmptyState icon={Upload} title={t("noAccessTitle")} body={t("noAccessBody")} />
      </>
    );
  }
  const format = await getFormatter();
  const { rows, lastMapping } = await listImports(db, viewer);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <ImportWizard lastMapping={lastMapping as Record<string, string> | null} />
        </Card>
        <Card className="self-start">
          <CardTitle className="mb-3">{t("history")}</CardTitle>
          {rows.length === 0 ? (
            <p className="text-muted text-sm">{t("noHistory")}</p>
          ) : (
            <ul className="divide-border divide-y text-sm">
              {rows.map((r) => (
                <li key={r.id} className="py-2">
                  <a href={`/files/${r.fileId}`} className="font-medium hover:underline">
                    {format.dateTime(r.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                  </a>
                  <p className="text-muted text-xs">
                    {t("historyLine", { imported: r.rowsImported, rejected: r.rowsRejected })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
