import { ChevronRight, Code, ScrollText, Settings, ShieldAlert, ShieldCheck, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { TeamInviteDialog } from "@/components/admin/team-invite-dialog";
import { StaffRoleForm } from "@/components/admin/staff-role-form";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
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
  const tn = await getTranslations("userMenu");
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

  const links = [
    { href: "/account" as const, icon: UserRound, title: tn("account"), body: t("profileBody") },
    { href: "/admin/settings/audit" as const, icon: ScrollText, title: t("auditTitle"), body: t("auditBody") },
    { href: "/admin/settings/developers" as const, icon: Code, title: t("developersTitle"), body: t("developersBody") },
    { href: "/admin/settings/privacy" as const, icon: ShieldCheck, title: t("privacyTitle"), body: t("privacyBody") },
  ];

  return (
    <>
      <PageHeader title={t("settingsTitle")} description={t("settingsSubtitle")} />
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:gap-12">
        <section aria-labelledby="team-title">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <h2 id="team-title" className="text-2xl font-light tracking-tight">
                {t("title")}
              </h2>
              <p className="text-muted mt-1 text-sm">{t("members", { count: staff.length })}</p>
            </div>
            <TeamInviteDialog />
          </div>
          <ul className="border-border bg-surface divide-border divide-y rounded-lg border">
            {staff.map((s) => (
              <li key={s.id} className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:px-7">
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <Avatar name={s.name} image={s.image} className="size-12 text-sm" />
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      {s.name}
                      {s.id === viewer.id ? <Badge>{t("you")}</Badge> : null}
                    </p>
                    <p className="text-muted truncate text-sm">{s.email}</p>
                    <p className="text-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      {s.twoFactorEnabled ? (
                        <span className="text-success inline-flex items-center gap-1">
                          <ShieldCheck className="size-3.5" strokeWidth={1.5} aria-hidden />
                          {t("twoFactorOn")}
                        </span>
                      ) : (
                        <span className="text-warning inline-flex items-center gap-1">
                          <ShieldAlert className="size-3.5" strokeWidth={1.5} aria-hidden />
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
                </div>
                <StaffRoleForm action={setStaffRoleAction.bind(null, s.id)} current={s.staffRole!} name={s.name} />
              </li>
            ))}
          </ul>
        </section>

        <div className="flex flex-col gap-6">
          <nav
            aria-label={t("settingsTitle")}
            className="border-border bg-surface divide-border divide-y rounded-lg border"
          >
            {links.map(({ href, icon: LinkIcon, title, body }) => (
              <Link
                key={href}
                href={href}
                className="group hover:bg-surface-muted/60 flex items-center gap-4 px-6 py-5 transition-colors first:rounded-t-lg last:rounded-b-lg"
              >
                <span className="border-border text-muted group-hover:text-text flex size-10 shrink-0 items-center justify-center rounded-full border transition-colors">
                  <Icon icon={LinkIcon} className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{title}</span>
                  <span className="text-muted block text-sm">{body}</span>
                </span>
                <ChevronRight
                  className="text-muted size-4 transition-transform group-hover:translate-x-0.5"
                  strokeWidth={1.5}
                  aria-hidden
                />
              </Link>
            ))}
          </nav>
          <IntegrationsCard viewer={viewer} />
        </div>
      </div>
    </>
  );
}
