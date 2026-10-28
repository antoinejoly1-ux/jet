import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PnlView } from "@/components/billing/pnl-view";
import { YearPicker } from "@/components/billing/year-picker";
import { PageHeader } from "@/components/ui/page-header";
import { ForbiddenError } from "@/lib/auth/policy";
import { requireAccess } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/services/errors";
import { getCompanyPnl } from "@/lib/services/pnl";
import { zonedDay } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("pnl"))("title") };
}

/**
 * The holding company's results, for its owners and the people who keep its
 * books: does the company balance?
 */
export default async function ResultsPage({ params, searchParams }: PageProps<"/results/[companyId]">) {
  const viewer = await requireAccess();
  const { companyId } = await params;
  const sp = await searchParams;
  const thisYear = Number(zonedDay(new Date()).slice(0, 4));
  const year = Number(typeof sp.year === "string" ? sp.year : thisYear) || thisYear;
  const t = await getTranslations("pnl");
  const pnl = await getCompanyPnl(db, viewer, companyId, year).catch((e) =>
    e instanceof NotFoundError || e instanceof ForbiddenError ? notFound() : Promise.reject(e),
  );
  // Back to where people come from: the company's billing for its managers, Finances for owners.
  const manages = !!viewer.managedCompanyIds?.includes(companyId);
  const tb = await getTranslations("billing");
  const tn = await getTranslations("nav.items");
  return (
    <>
      <Link
        href={manages ? "/billing" : "/finances"}
        className="text-muted hover:text-text mb-2 -ml-1 inline-flex h-11 items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {manages ? tb("back") : tn("finances")}
      </Link>
      <PageHeader
        eyebrow={pnl.company.legalName}
        title={t("titleYear", { year })}
        description={t("ownerSubtitle", { aircraft: pnl.aircraft.map((a) => a.registration).join(", ") })}
        actions={<YearPicker year={year} years={[thisYear, thisYear - 1, thisYear - 2]} />}
      />
      <PnlView pnl={pnl} locale={await getLocale()} />
    </>
  );
}
