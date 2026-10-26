import { ChevronRight, Code, MailPlus, ScrollText, Settings, ShieldCheck, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { StaffRoleForm } from "@/components/admin/staff-role-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listStaff } from "@/lib/services/team";
import { IntegrationsCard } from "./integrations-card";
import { setStaffRoleAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("settings") };
}

export default async function SettingsPage() {
  const viewer = await requireStaff();
  const t = await getTranslations("team");
  const format = await getFormatter();

  if (!can(viewer, "team:manage")) {
    return (
      <>
        <PageHeader title={t("settingsTitle")} />
        <EmptyState icon={Settings} title={t("adminOnlyTitle")} body={t("adminOnlyBody")} />
      </>
    );
  }

  const staff = await listStaff(db, viewer);

  return (
    <>
      <PageHeader title={t("settingsTitle")} description={t("settingsSubtitle")} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-3">
            <CardTitle>{t("title")}</CardTitle>
            <Button asChild size="sm" variant="secondary">
              <Link href="/admin/invitations">
                <MailPlus aria-hidden />
                {t("invite")}
              </Link>
            </Button>
          </div>
          <ul className="divide-border divide-y">
            {staff.map((s) => (
              <li key={s.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold">
                    {s.name}
                    {s.id === viewer.id ? <Badge>{t("you")}</Badge> : null}
                  </p>
                  <p className="text-muted truncate text-sm">{s.email}</p>
                  <p className="text-muted mt-1 flex items-center gap-3 text-xs">
                    {s.twoFactorEnabled ? (
                      <span className="text-success inline-flex items-center gap-1">
                        <ShieldCheck className="size-3.5" aria-hidden />
                        {t("twoFactorOn")}
                      </span>
                    ) : (
                      <span className="text-warning inline-flex items-center gap-1">
                        <ShieldAlert className="size-3.5" aria-hidden />
                        {t("twoFactorOff")}
                      </span>
                    )}
                    <span>
                      {s.lastSignInAt
                        ? t("lastSignIn", { date: format.relativeTime(s.lastSignInAt) })
                        : t("neverSignedIn")}
                    </span>
                  </p>
                </div>
                <StaffRoleForm action={setStaffRoleAction.bind(null, s.id)} current={s.staffRole!} name={s.name} />
              </li>
            ))}
          </ul>
        </Card>
        <div className="flex flex-col gap-4">
          <Link href="/admin/settings/audit" className="group">
            <Card className="group-hover:bg-surface-muted flex items-center gap-4 transition-colors">
              <ScrollText className="text-muted size-5" aria-hidden />
              <div className="flex-1">
                <p className="font-semibold">{t("auditTitle")}</p>
                <p className="text-muted text-sm">{t("auditBody")}</p>
              </div>
              <ChevronRight className="text-muted size-4" aria-hidden />
            </Card>
          </Link>
          <Link href="/admin/settings/developers" className="group">
            <Card className="group-hover:bg-surface-muted flex items-center gap-4 transition-colors">
              <Code className="text-muted size-5" aria-hidden />
              <div className="flex-1">
                <p className="font-semibold">{t("developersTitle")}</p>
                <p className="text-muted text-sm">{t("developersBody")}</p>
              </div>
              <ChevronRight className="text-muted size-4" aria-hidden />
            </Card>
          </Link>
          <Link href="/admin/settings/privacy" className="group">
            <Card className="group-hover:bg-surface-muted flex items-center gap-4 transition-colors">
              <ShieldCheck className="text-muted size-5" aria-hidden />
              <div className="flex-1">
                <p className="font-semibold">{t("privacyTitle")}</p>
                <p className="text-muted text-sm">{t("privacyBody")}</p>
              </div>
              <ChevronRight className="text-muted size-4" aria-hidden />
            </Card>
          </Link>
          <IntegrationsCard viewer={viewer} />
        </div>
      </div>
    </>
  );
}
