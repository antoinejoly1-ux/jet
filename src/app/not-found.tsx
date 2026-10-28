import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { AuthFrame } from "@/components/auth/auth-frame";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("notFound"))("metaTitle") };
}

/** Any address that leads nowhere: the account screens' frame, and the way back. */
export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <AuthFrame>
      <div className="flex flex-col gap-6">
        <div>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1 className="mt-3 text-[2rem] leading-tight font-light tracking-tight">{t("title")}</h1>
          <p className="text-muted mt-3 text-[15px] leading-relaxed">{t("body")}</p>
        </div>
        <Button asChild size="lg" className="self-start">
          <Link href="/start">
            {t("home")}
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    </AuthFrame>
  );
}
