import { Eye, MailPlus, Pencil, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { startViewAsAction } from "@/app/actions/view-as";
import { ArchiveForm } from "@/components/admin/archive-form";
import { History } from "@/components/admin/history";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatHours } from "@/lib/format";
import { NotFoundError } from "@/lib/services/errors";
import { getOwner } from "@/lib/services/owners";
import { archiveOwnerAction, removeMemberAction } from "../actions";

export async function generateMetadata({ params }: PageProps<"/admin/owners/[id]">): Promise<Metadata> {
  const { id } = await params;
  const viewer = await requireStaff();
  const detail = await getOwner(db, viewer, id).catch(() => null);
  return { title: detail?.owner.legalName ?? "" };
}

export default async function OwnerDetailPage({ params }: PageProps<"/admin/owners/[id]">) {
  const viewer = await requireStaff();
  const { id } = await params;
  const t = await getTranslations("owners");
  const format = await getFormatter();
  const { owner, shares, members, pendingInvitations, history } = await getOwner(db, viewer, id).catch((e) =>
    e instanceof NotFoundError ? notFound() : Promise.reject(e),
  );
  const canWrite = can(viewer, "owners:write");
  const today = new Date().toISOString().slice(0, 10);
  const day = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00`), { dateStyle: "medium" });

  return (
    <>
      <PageHeader
        title={owner.legalName}
        description={`${t(`types.${owner.type}`)}${owner.email ? ` · ${owner.email}` : ""}`}
        actions={
          <>
            <form action={startViewAsAction.bind(null, owner.id)}>
              <Button type="submit" variant="secondary" size="sm">
                <Eye aria-hidden />
                {t("viewAs")}
              </Button>
            </form>
            {can(viewer, "owners:invite") ? (
              <Button asChild variant="secondary" size="sm">
                <Link href={`/admin/invitations?owner=${owner.id}`}>
                  <MailPlus aria-hidden />
                  {t("invite")}
                </Link>
              </Button>
            ) : null}
            {canWrite ? (
              <Button asChild size="sm">
                <Link href={`/admin/owners/${owner.id}/edit`}>
                  <Pencil aria-hidden />
                  {t("edit")}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle className="mb-3">{t("shares")}</CardTitle>
          {shares.length === 0 ? (
            <p className="text-muted text-sm">{t("noShares")}</p>
          ) : (
            <ul className="divide-border divide-y">
              {shares.map((s) => {
                const active = !s.endsOn || s.endsOn > today;
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
                    <Link href={`/admin/aircraft/${s.aircraftId}`} className="font-semibold hover:underline">
                      {s.registration}
                    </Link>
                    <span className="text-muted text-sm">{s.model}</span>
                    <span className="tabular text-sm">
                      {format.number(s.percentageBp / 10000, { style: "percent", maximumFractionDigits: 2 })}
                    </span>
                    {s.annualHoursMinutes ? (
                      <span className="tabular text-muted text-sm">
                        {t("perYear", { hours: formatHours(s.annualHoursMinutes, viewer.locale) })}
                      </span>
                    ) : null}
                    <span className="text-muted ml-auto text-xs">
                      {active ? t("since", { date: day(s.startsOn) }) : t("ended", { date: day(s.endsOn!) })}
                    </span>
                    {!active ? <Badge>{t("endedBadge")}</Badge> : null}
                  </li>
                );
              })}
            </ul>
          )}
          {can(viewer, "fleet:write") ? <p className="text-muted mt-4 text-xs">{t("sharesHint")}</p> : null}
        </Card>

        <Card>
          <CardTitle className="mb-3">{t("contact")}</CardTitle>
          <dl className="grid gap-2 text-sm">
            <dt className="text-muted text-xs">{t("email")}</dt>
            <dd className="break-all">{owner.email ?? "—"}</dd>
            <dt className="text-muted text-xs">{t("phone")}</dt>
            <dd>{owner.phone ?? "—"}</dd>
            <dt className="text-muted text-xs">{t("language")}</dt>
            <dd>{owner.locale === "fr" ? "Français" : "English"}</dd>
            {owner.notes ? (
              <>
                <dt className="text-muted text-xs">{t("notes")}</dt>
                <dd className="whitespace-pre-line">{owner.notes}</dd>
              </>
            ) : null}
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle className="mb-3">{t("loginsTitle")}</CardTitle>
          {members.length === 0 && pendingInvitations.length === 0 ? (
            <p className="text-muted text-sm">{t("noLogins")}</p>
          ) : (
            <ul className="divide-border divide-y">
              {members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{m.name}</p>
                    <p className="text-muted truncate text-xs">{m.email}</p>
                  </div>
                  <Badge>{t(`memberRoles.${m.role}`)}</Badge>
                  {canWrite ? (
                    <form action={removeMemberAction.bind(null, owner.id, m.id)}>
                      <Button type="submit" variant="ghost" size="sm" aria-label={t("removeLogin", { name: m.name })}>
                        <Trash2 aria-hidden />
                      </Button>
                    </form>
                  ) : null}
                </li>
              ))}
              {pendingInvitations.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <p className="min-w-0 flex-1 truncate text-sm">{i.email}</p>
                  <Badge tone="accent">{t("invitationPending")}</Badge>
                </li>
              ))}
            </ul>
          )}
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
            action={archiveOwnerAction.bind(null, owner.id)}
            label={t("archive")}
            question={t("archiveConfirm")}
          />
        </section>
      ) : null}
    </>
  );
}
