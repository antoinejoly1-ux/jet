import { Building2, ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listHoldingCompanies } from "@/lib/services/holding-companies";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("holdingCompanies") };
}

export default async function HoldingCompaniesPage() {
  const viewer = await requireStaff();
  const t = await getTranslations("holdingCompanies");
  const rows = await listHoldingCompanies(db, viewer);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          can(viewer, "owners:write") ? (
            <Button asChild size="sm">
              <Link href="/admin/holding-companies/new">
                <Plus aria-hidden />
                {t("new")}
              </Link>
            </Button>
          ) : null
        }
      />
      {rows.length === 0 ? (
        <EmptyState icon={Building2} title={t("emptyTitle")} body={t("emptyBody")} />
      ) : (
        <ul className="bg-surface divide-border border-border divide-y rounded-lg border">
          {rows.map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/holding-companies/${c.id}`}
                className="hover:bg-surface-muted flex items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{c.legalName}</p>
                  <p className="text-muted truncate text-sm">
                    {[c.registrationNumber, c.email].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <span className="text-sm">{c.aircraft.join(", ") || t("noAircraft")}</span>
                <ChevronRight className="text-muted size-4 shrink-0" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
