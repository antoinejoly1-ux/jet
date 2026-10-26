import { Users } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listOwners } from "@/lib/services/owners";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("owners") };
}

export default async function OwnersPage() {
  const viewer = await requireStaff();
  const t = await getTranslations("owners");
  const rows = await listOwners(db, viewer);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      {rows.length === 0 ? (
        <EmptyState icon={Users} title={t("emptyTitle")} body={t("emptyBody")} />
      ) : (
        <>
          {/* Phone: stacked cards. Tablet and up: a table. */}
          <ul className="flex flex-col gap-3 md:hidden">
            {rows.map((o) => (
              <li key={o.id} className="border-border bg-surface rounded-lg border p-4">
                <p className="font-semibold">{o.legalName}</p>
                <p className="text-muted text-sm">{o.email ?? "—"}</p>
                <p className="mt-2 text-sm">{o.aircraft.join(", ") || t("noAircraft")}</p>
              </li>
            ))}
          </ul>
          <div className="border-border bg-surface hidden overflow-hidden rounded-lg border md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-border bg-surface-muted text-muted border-b text-xs font-semibold">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    {t("name")}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t("type")}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t("email")}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t("aircraft")}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    {t("logins")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-3 font-medium">{o.legalName}</td>
                    <td className="text-muted px-4 py-3">{t(`types.${o.type}`)}</td>
                    <td className="text-muted px-4 py-3">{o.email ?? "—"}</td>
                    <td className="px-4 py-3">{o.aircraft.join(", ") || "—"}</td>
                    <td className="tabular px-4 py-3 text-right">{o.members}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
