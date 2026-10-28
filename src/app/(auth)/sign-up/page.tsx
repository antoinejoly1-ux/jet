import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { env, googleEnabled } from "@/lib/env";
import { formatPhone, telHref } from "@/lib/phone";
import { safeNext } from "@/lib/safe-next";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth"))("signUpTitle") };
}

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const { next, email } = await searchParams;
  const t = await getTranslations("auth");
  const phone = env.OPERATOR_PHONE;
  return (
    <SignUpForm
      next={safeNext(typeof next === "string" ? next : null)}
      googleEnabled={googleEnabled}
      defaultEmail={typeof email === "string" ? email : undefined}
      call={
        phone ? { href: telHref(phone), label: t("callTeam", { phone: formatPhone(phone, await getLocale()) }) } : null
      }
    />
  );
}
