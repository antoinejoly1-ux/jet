import { MailPlus } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listInvitations } from "@/lib/services/invitations";
import { listOwners } from "@/lib/services/owners";
import { revokeInvitationAction } from "./actions";
import { InviteForm } from "./invite-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("invitations") };
}

const TONE = {
  valid: "accent",
  accepted: "success",
  expired: "neutral",
  revoked: "neutral",
  not_found: "neutral",
} as const;

export default async function InvitationsPage() {
  const viewer = await requireStaff();
  const t = await getTranslations("invitations");
  const format = await getFormatter();

  if (!can(viewer, "owners:invite")) {
    return (
      <>
        <PageHeader title={t("title")} />
        <EmptyState icon={MailPlus} title={t("noPermissionTitle")} body={t("noPermissionBody")} />
      </>
    );
  }

  const [owners, rows] = await Promise.all([listOwners(db, viewer), listInvitations(db, viewer)]);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        <Card className="self-start">
          <CardTitle className="mb-4">{t("newInvitation")}</CardTitle>
          <InviteForm
            owners={owners.map(({ id, legalName }) => ({ id, legalName }))}
            canInviteStaff={can(viewer, "team:manage")}
          />
        </Card>
        {rows.length === 0 ? (
          <EmptyState icon={MailPlus} title={t("emptyTitle")} body={t("emptyBody")} />
        ) : (
          <ul className="divide-border border-border bg-surface flex flex-col divide-y self-start rounded-lg border">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{r.email}</p>
                  <p className="text-muted truncate text-xs">
                    {r.ownerName ?? t(`staffRoles.${r.staffRole ?? "admin"}`)} ·{" "}
                    {format.dateTime(r.createdAt, { dateStyle: "medium" })}
                  </p>
                </div>
                <Badge tone={TONE[r.state]}>{t(`states.${r.state}`)}</Badge>
                {r.state === "valid" ? (
                  <form action={revokeInvitationAction.bind(null, r.id)}>
                    <Button type="submit" size="sm" variant="ghost">
                      {t("revoke")}
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
