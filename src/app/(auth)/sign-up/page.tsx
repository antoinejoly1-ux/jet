import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { googleEnabled } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth"))("signUpTitle") };
}

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const { next, email } = await searchParams;
  return (
    <SignUpForm
      next={safeNext(typeof next === "string" ? next : null)}
      googleEnabled={googleEnabled}
      defaultEmail={typeof email === "string" ? email : undefined}
    />
  );
}
