import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SignInForm } from "@/components/auth/sign-in-form";
import { googleEnabled } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth"))("signInTitle") };
}

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { next, email } = await searchParams;
  return (
    <SignInForm
      next={safeNext(typeof next === "string" ? next : null)}
      googleEnabled={googleEnabled}
      defaultEmail={typeof email === "string" ? email : undefined}
    />
  );
}
