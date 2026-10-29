import { ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { CloseRequestForm, IncidentForm, IncidentReportingForm } from "@/components/admin/privacy-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listIncidents, listPrivacyRequests, RESPONSE_DAYS } from "@/lib/services/privacy";
import { closeRequestAction, incidentReportingAction, recordIncidentAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("privacyAdmin"))("title") };
}

const DAY = 86_400_000;

export default async function PrivacyAdminPage() {
  const viewer = await requireStaff();
  if (!can(viewer, "team:manage")) redirect("/admin/settings");
  const t = await getTranslations("privacyAdmin");
  const ta = await getTranslations("account");
  const format = await getFormatter();
  const [{ open, closed }, incidents] = await Promise.all([listPrivacyRequests(db, viewer), listIncidents(db, viewer)]);
  const day = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00`), { dateStyle: "medium" });
  // A fixed "now" for the whole render keeps the deadline math pure.
  const now = Date.parse(new Date().toISOString());

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-3">{t("requestsTitle")}</CardTitle>
          {open.length === 0 ? (
            <p className="text-muted text-sm">{t("noOpenRequests")}</p>
          ) : (
            <ul className="divide-border flex flex-col divide-y">
              {open.map((r) => {
                const daysLeft = Math.ceil((r.createdAt.getTime() + RESPONSE_DAYS * DAY - now) / DAY);
                return (
                  <li key={r.id} className="py-4 first:pt-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{ta(`privacyKinds.${r.kind}`)}</span>
                      <Badge tone={daysLeft <= 5 ? "danger" : "warning"}>{t("daysLeft", { count: daysLeft })}</Badge>
                    </p>
                    <p className="text-muted text-sm">
                      {r.email} · {format.dateTime(r.createdAt, { dateStyle: "medium" })}
                    </p>
                    {r.details ? <p className="mt-1 text-sm whitespace-pre-wrap">{r.details}</p> : null}
                    <CloseRequestForm action={closeRequestAction.bind(null, r.id)} id={r.id} />
                  </li>
                );
              })}
            </ul>
          )}
          {closed.length ? (
            <details className="mt-4">
              <summary className="text-muted cursor-pointer text-sm">
                {t("closedRequests", { count: closed.length })}
              </summary>
              <ul className="mt-2 flex flex-col gap-2 text-sm">
                {closed.map((r) => (
                  <li key={r.id}>
                    <span className="font-medium">{ta(`privacyKinds.${r.kind}`)}</span> · {r.email} ·{" "}
                    {ta(`privacyStatuses.${r.status}`)} · {format.dateTime(r.closedAt!, { dateStyle: "medium" })}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Card>

        <Card>
          <CardTitle className="mb-1">{t("newIncident")}</CardTitle>
          <p className="text-muted mb-4 text-sm">{t("newIncidentBody")}</p>
          <IncidentForm action={recordIncidentAction} />
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <ShieldAlert className="text-muted size-4" aria-hidden />
            <CardTitle>{t("registerTitle")}</CardTitle>
          </div>
          {incidents.length === 0 ? (
            <p className="text-muted text-sm">{t("noIncidents")}</p>
          ) : (
            <ul className="divide-border flex flex-col divide-y">
              {incidents.map((i) => (
                <li key={i.id} className="py-4 first:pt-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{day(i.occurredOn)}</span>
                    <Badge tone={i.severity === "serious" ? "danger" : "neutral"}>
                      {t(`severities.${i.severity}`)}
                    </Badge>
                    {i.severity === "serious" && !i.reportedToCaiOn ? (
                      <Badge tone="warning">{t("mustReport")}</Badge>
                    ) : null}
                  </p>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{i.description}</p>
                  <p className="text-muted mt-1 text-xs">
                    {t("dataConcerned")}: {i.dataConcerned} · {t("peopleConcerned")}: {i.peopleConcerned}
                  </p>
                  <p className="text-muted text-xs">
                    {t("measures")}: {i.measures}
                  </p>
                  <IncidentReportingForm
                    action={incidentReportingAction.bind(null, i.id)}
                    id={i.id}
                    reportedToCaiOn={i.reportedToCaiOn}
                    peopleNotifiedOn={i.peopleNotifiedOn}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
