import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TwoFactorSetup } from "@/components/auth/two-factor-forms";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireViewer } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { hasPassword } from "@/lib/services/account";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("account"))("security") };
}

export default async function SecurityPage({ searchParams }: PageProps<"/account/security">) {
  const viewer = await requireViewer();
  const { required } = await searchParams;
  const t = await getTranslations("twoFactor");

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid max-w-2xl gap-4">
        {required && !viewer.twoFactorEnabled ? <Alert tone="danger">{t("requiredForStaff")}</Alert> : null}
        <Card>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>{t("authenticatorApp")}</CardTitle>
            <Badge tone={viewer.twoFactorEnabled ? "success" : "neutral"}>
              {viewer.twoFactorEnabled ? t("on") : t("off")}
            </Badge>
          </div>
          <div className="mt-4">
            {viewer.twoFactorEnabled ? (
              <p className="text-muted text-sm">{t("enabledBody")}</p>
            ) : (
              <TwoFactorSetup hasPassword={await hasPassword(db, viewer.id)} />
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
