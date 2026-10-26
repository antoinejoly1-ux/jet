import { ChevronRight, Plus, Search, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listOwners } from "@/lib/services/owners";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("owners") };
}

export default async function OwnersPage({ searchParams }: PageProps<"/admin/owners">) {
  const viewer = await requireStaff();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";
  const t = await getTranslations("owners");
  const rows = await listOwners(db, viewer, { q: query });

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          can(viewer, "owners:write") ? (
            <Button asChild size="sm">
              <Link href="/admin/owners/new">
                <Plus aria-hidden />
                {t("new")}
              </Link>
            </Button>
          ) : null
        }
      />
      {/* Search lives in the URL, so a filtered list can be bookmarked or shared. */}
      <form role="search" className="relative mb-5 max-w-md">
        <Search
          className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          name="q"
          type="search"
          defaultValue={query}
          placeholder={t("searchPlaceholder")}
          aria-label={t("search")}
          className="pl-9"
        />
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={query ? t("noResults") : t("emptyTitle")}
          body={query ? t("noResultsBody") : t("emptyBody")}
        />
      ) : (
        <>
          <ul className="flex flex-col gap-3 md:hidden">
            {rows.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/admin/owners/${o.id}`}
                  className="border-border bg-surface flex items-center gap-3 rounded-lg border p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{o.legalName}</p>
                    <p className="text-muted truncate text-sm">{o.email ?? "—"}</p>
                    <p className="mt-2 text-sm">{o.aircraft.join(", ") || t("noAircraft")}</p>
                  </div>
                  <ChevronRight className="text-muted size-4" aria-hidden />
                </Link>
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
                  <tr key={o.id} className="hover:bg-surface-muted relative">
                    <td className="px-4 py-3 font-medium">
                      {/* The link covers the whole row. */}
                      <Link href={`/admin/owners/${o.id}`} className="after:absolute after:inset-0">
                        {o.legalName}
                      </Link>
                    </td>
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
