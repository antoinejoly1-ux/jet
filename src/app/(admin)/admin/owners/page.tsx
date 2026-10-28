import { MailPlus, Plus, Search, Users } from "lucide-react";
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
import { listOwners, type OwnerAccess } from "@/lib/services/owners";
import { cn } from "@/lib/utils";

const ACCESS = ["not_invited", "invited", "active"] as const satisfies readonly OwnerAccess[];

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("owners") };
}

export default async function OwnersPage({ searchParams }: PageProps<"/admin/owners">) {
  const viewer = await requireStaff();
  const { q, access: accessParam } = await searchParams;
  const query = typeof q === "string" ? q : "";
  const access = ACCESS.find((a) => a === accessParam);
  const t = await getTranslations("owners");
  const rows = await listOwners(db, viewer, { q: query, access });
  const canInvite = can(viewer, "owners:invite");
  const href = (a?: OwnerAccess) =>
    `/admin/owners?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(a ? { access: a } : {}) })}`;

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
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center">
        <form role="search" className="relative w-full max-w-md">
          {access ? <input type="hidden" name="access" value={access} /> : null}
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
        <nav aria-label={t("accessFilter")} className="flex flex-wrap gap-2">
          {[undefined, ...ACCESS].map((a) => (
            <Link
              key={a ?? "all"}
              href={href(a) as never}
              aria-current={access === a ? "page" : undefined}
              className={cn(
                "border-border rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap",
                access === a
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-surface text-muted hover:text-text",
              )}
            >
              {t(`accessFilters.${a ?? "all"}`)}
            </Link>
          ))}
        </nav>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={query || access ? t("noResults") : t("emptyTitle")}
          body={query ? t("noResultsBody") : access ? t("noResultsFilterBody") : t("emptyBody")}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((o) => (
            <li
              key={o.id}
              className="group bg-surface border-border hover:border-text/30 relative flex h-full items-start gap-4 rounded-lg border p-5 transition-colors"
            >
              <Avatar name={o.legalName} image={o.image} className="size-12 text-sm" />
              <div className="min-w-0 flex-1">
                {/* The whole card opens the owner; the invite button sits above the link. */}
                <Link
                  href={`/admin/owners/${o.id}`}
                  className="block truncate font-medium group-hover:underline after:absolute after:inset-0"
                >
                  {o.legalName}
                </Link>
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
              <div className="flex shrink-0 flex-col items-end gap-2">
                <span className="text-muted text-xs whitespace-nowrap">
                  {o.members > 0
                    ? t("accounts", { count: o.members })
                    : o.invited
                      ? t("invitationPending")
                      : t("notInvited")}
                </span>
                {canInvite && o.members === 0 && !o.invited ? (
                  <Button asChild size="sm" variant="secondary" className="relative z-10">
                    <Link href={`/admin/invitations?owner=${o.id}`}>
                      <MailPlus aria-hidden />
                      {t("invite")}
                    </Link>
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
