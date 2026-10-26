import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireViewer } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("account"))("security") };
}

export default async function SecurityPage() {
  const viewer = await requireViewer();
  const t = await getTranslations("twoFactor");

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Card className="max-w-2xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-muted size-4" aria-hidden />
            <CardTitle>{t("authenticatorApp")}</CardTitle>
          </div>
          <Badge tone={viewer.twoFactorEnabled ? "success" : "neutral"}>
            {viewer.twoFactorEnabled ? t("on") : t("off")}
          </Badge>
        </div>
        <p className="text-muted mt-3 text-sm">{viewer.twoFactorEnabled ? t("enabledBody") : t("disabledBody")}</p>
        {viewer.twoFactorEnabled ? null : (
          <Button asChild className="mt-4">
            <Link href="/setup-2fa?next=/account/security">{t("setUp")}</Link>
          </Button>
        )}
      </Card>
    </>
  );
}
