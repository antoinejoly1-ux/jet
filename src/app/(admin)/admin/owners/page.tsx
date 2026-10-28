import { Plus, Search, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Avatar } from "@/components/ui/avatar";
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
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((o) => (
            <li key={o.id}>
              <Link
                href={`/admin/owners/${o.id}`}
                className="group bg-surface border-border hover:border-text/30 flex h-full items-start gap-4 rounded-lg border p-5 transition-colors"
              >
                <Avatar name={o.legalName} image={o.image} className="size-12 text-sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium group-hover:underline">{o.legalName}</p>
                  <p className="text-muted truncate text-sm">{o.email ?? t(`types.${o.type}`)}</p>
                  <p className="mt-3 flex flex-wrap gap-1.5">
                    {o.aircraft.length ? (
                      o.aircraft.map((r) => (
                        <span key={r} className="bg-surface-muted rounded-full px-2.5 py-0.5 text-xs font-medium">
                          {r}
                        </span>
                      ))
                    ) : (
                      <span className="text-muted text-xs">{t("noAircraft")}</span>
                    )}
                  </p>
                </div>
                <span className="text-muted text-xs whitespace-nowrap">{t("loginsCount", { count: o.members })}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
