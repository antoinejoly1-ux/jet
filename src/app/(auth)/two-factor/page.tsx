import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TwoFactorChallenge } from "@/components/auth/two-factor-forms";
import { safeNext } from "@/lib/safe-next";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("twoFactor"))("verifyTitle") };
}

export default async function TwoFactorPage({ searchParams }: PageProps<"/two-factor">) {
  const { next } = await searchParams;
  return <TwoFactorChallenge next={safeNext(typeof next === "string" ? next : null)} />;
}
