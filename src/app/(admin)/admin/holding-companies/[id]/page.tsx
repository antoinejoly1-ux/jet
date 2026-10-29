import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArchiveForm } from "@/components/admin/archive-form";
import { History } from "@/components/admin/history";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/services/errors";
import { getHoldingCompany } from "@/lib/services/holding-companies";
import {
  addManagerAction,
  archiveHoldingCompanyAction,
  removeManagerAction,
  saveBillingProfileAction,
} from "../actions";
import { AddManagerForm, BillingProfileForm } from "@/components/billing/billing-profile-form";
import { defaultPrefix, listManagers } from "@/lib/services/billing";

export async function generateMetadata({ params }: PageProps<"/admin/holding-companies/[id]">): Promise<Metadata> {
  const { id } = await params;
  const viewer = await requireStaff();
  const detail = await getHoldingCompany(db, viewer, id).catch(() => null);
  return { title: detail?.company.legalName ?? "" };
}

export default async function HoldingCompanyPage({ params }: PageProps<"/admin/holding-companies/[id]">) {
  const viewer = await requireStaff();
  const { id } = await params;
  const t = await getTranslations("holdingCompanies");
  const format = await getFormatter();
  const { company, aircraft, shareholders, history } = await getHoldingCompany(db, viewer, id).catch((e) =>
    e instanceof NotFoundError ? notFound() : Promise.reject(e),
  );
  const canWrite = can(viewer, "owners:write");
  const canBill = can(viewer, "finance:write");
  const tb = await getTranslations("billingProfile");
  const managers = await listManagers(db, viewer, company.id);

  return (
    <>
      <PageHeader
        title={company.legalName}
        description={company.registrationNumber ? t("neq", { number: company.registrationNumber }) : undefined}
        actions={
          <>
            {can(viewer, "finance:read") ? (
              <Button asChild size="sm" variant="secondary">
                <Link href={`/admin/holding-companies/${company.id}/results`}>{tb("results")}</Link>
              </Button>
            ) : null}
            {canWrite ? (
              <Button asChild size="sm">
                <Link href={`/admin/holding-companies/${company.id}/edit`}>
                  <Pencil aria-hidden />
                  {t("edit")}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle className="mb-3">{t("aircraftTitle")}</CardTitle>
          {aircraft.length === 0 ? (
            <p className="text-muted text-sm">{t("noAircraftBody")}</p>
          ) : (
            <ul className="divide-border divide-y">
              {aircraft.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
                  <Link href={`/admin/aircraft/${a.id}`} className="font-semibold hover:underline">
                    {a.registration}
                  </Link>
                  <span className="text-muted text-sm">{a.model}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-muted mt-4 text-xs">{t("aircraftHint")}</p>
        </Card>

        <Card>
          <CardTitle className="mb-3">{t("contact")}</CardTitle>
          <dl className="grid gap-2 text-sm">
            <dt className="text-muted text-xs">{t("email")}</dt>
            <dd className="break-all">{company.email ?? "—"}</dd>
            <dt className="text-muted text-xs">{t("phone")}</dt>
            <dd>{company.phone ?? "—"}</dd>
            {company.notes ? (
              <>
                <dt className="text-muted text-xs">{t("notes")}</dt>
                <dd className="whitespace-pre-line">{company.notes}</dd>
              </>
            ) : null}
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle className="mb-3">{t("shareholders")}</CardTitle>
          {shareholders.length === 0 ? (
            <p className="text-muted text-sm">{t("noShareholders")}</p>
          ) : (
            <ul className="divide-border divide-y">
              {shareholders.map((s) => (
                <li key={s.shareId} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
                  <Link href={`/admin/owners/${s.ownerId}`} className="font-semibold hover:underline">
                    {s.ownerName}
                  </Link>
                  <span className="text-muted text-sm">{s.registration}</span>
                  <span className="tabular ml-auto text-sm">
                    {format.number(s.percentageBp / 10000, { style: "percent", maximumFractionDigits: 2 })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2" id="billing">
          <CardTitle className="mb-1">{tb("title")}</CardTitle>
          <p className="text-muted mb-5 text-sm">{tb("body")}</p>
          {canBill ? (
            <BillingProfileForm
              action={saveBillingProfileAction.bind(null, company.id)}
              profile={company}
              suggestedPrefix={defaultPrefix(company.legalName)}
            />
          ) : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted">{tb("gstNumber")}</dt>
              <dd>{company.gstNumber ?? tb("notRegistered")}</dd>
              <dt className="text-muted">{tb("qstNumber")}</dt>
              <dd>{company.qstNumber ?? tb("notRegistered")}</dd>
            </dl>
          )}
        </Card>

        <Card>
          <CardTitle className="mb-1">{tb("managersTitle")}</CardTitle>
          <p className="text-muted mb-4 text-sm">{tb("managersBody")}</p>
          {managers.length ? (
            <ul className="divide-border mb-4 divide-y">
              {managers.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    <p className="text-muted truncate text-xs">{m.email}</p>
                  </div>
                  {canBill ? (
                    <form action={removeManagerAction.bind(null, company.id, m.id)}>
                      <Button
                        type="submit"
                        size="sm"
                        variant="ghost"
                        aria-label={tb("removeManager", { name: m.name })}
                      >
                        {tb("remove")}
                      </Button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted mb-4 text-sm">{tb("noManagers")}</p>
          )}
          {canBill ? <AddManagerForm action={addManagerAction.bind(null, company.id)} /> : null}
        </Card>

        <Card>
          <CardTitle className="mb-3">{t("history")}</CardTitle>
          <History entries={history} />
        </Card>
      </div>

      {canWrite ? (
        <section className="border-border mt-10 border-t pt-6">
          <h2 className="mb-1 text-sm font-semibold">{t("archiveTitle")}</h2>
          <p className="text-muted mb-3 text-sm">{t("archiveBody")}</p>
          <ArchiveForm
            action={archiveHoldingCompanyAction.bind(null, company.id)}
            label={t("archive")}
            question={t("archiveConfirm")}
          />
        </section>
      ) : null}
    </>
  );
}
