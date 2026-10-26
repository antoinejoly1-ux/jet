import { ChevronRight, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireViewer } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { EmailPreferencesForm } from "@/components/account/email-preferences-form";
import { listSignInMethods } from "@/lib/services/account";
import { getEmailPreferences } from "@/lib/services/notification-center";
import { saveEmailPreferencesAction, setLocaleAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("account"))("title") };
}

export default async function AccountPage() {
  const viewer = await requireViewer();
  const t = await getTranslations("account");
  const locale = await getLocale();
  const [methods, emails] = await Promise.all([
    listSignInMethods(db, viewer.id),
    viewer.ownerIds.length && !viewer.viewingAs ? getEmailPreferences(db, viewer) : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader title={t("title")} />
      <div className="grid max-w-2xl gap-4">
        <Card>
          <CardTitle>{t("profile")}</CardTitle>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-[140px_1fr]">
            <dt className="text-muted">{t("name")}</dt>
            <dd className="font-medium">{viewer.name}</dd>
            <dt className="text-muted">{t("email")}</dt>
            <dd className="font-medium break-all">{viewer.email}</dd>
            <dt className="text-muted">{t("signInMethods")}</dt>
            <dd className="flex flex-wrap gap-2">
              {methods.map((m) => (
                <Badge key={m}>{t(`methods.${m === "google" ? "google" : "credential"}`)}</Badge>
              ))}
              <Badge>{t("methods.magicLink")}</Badge>
            </dd>
          </dl>
        </Card>

        <Card>
          <CardTitle>{t("language")}</CardTitle>
          <form action={setLocaleAction} className="mt-3 flex flex-wrap gap-2">
            {(["fr", "en"] as const).map((l) => (
              <Button
                key={l}
                type="submit"
                name="locale"
                value={l}
                variant={locale === l ? "primary" : "secondary"}
                size="sm"
                aria-pressed={locale === l}
              >
                {t(`languages.${l}`)}
              </Button>
            ))}
          </form>
        </Card>

        {emails ? (
          <Card>
            <CardTitle>{t("emailsTitle")}</CardTitle>
            <p className="text-muted mt-1 text-sm">{t("emailsBody")}</p>
            <EmailPreferencesForm
              action={saveEmailPreferencesAction}
              preferences={emails}
              disabled={!!viewer.viewingAs}
            />
          </Card>
        ) : null}

        <Link href="/account/security" className="group">
          <Card className="group-hover:bg-surface-muted flex items-center gap-4 transition-colors">
            <ShieldCheck className="text-muted size-5" aria-hidden />
            <div className="flex-1">
              <p className="font-semibold">{t("security")}</p>
              <p className="text-muted text-sm">{viewer.twoFactorEnabled ? t("twoFactorOn") : t("twoFactorOff")}</p>
            </div>
            <ChevronRight className="text-muted size-4" aria-hidden />
          </Card>
        </Link>
      </div>
    </>
  );
}
