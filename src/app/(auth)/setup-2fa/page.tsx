import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TwoFactorSetup } from "@/components/auth/two-factor-forms";
import { requireViewer } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";
import { hasPassword } from "@/lib/services/account";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("twoFactor"))("setupTitle") };
}

/** Guided 2FA setup. Staff are sent here on first sign-in when 2FA is required. */
export default async function SetupTwoFactorPage({ searchParams }: PageProps<"/setup-2fa">) {
  const viewer = await requireViewer();
  const { next } = await searchParams;
  const destination = safeNext(typeof next === "string" ? next : null);
  if (viewer.twoFactorEnabled) redirect(destination as never);
  return (
    <TwoFactorSetup
      hasPassword={await hasPassword(db, viewer.id)}
      next={destination}
      required={Boolean(viewer.staffRole) && env.REQUIRE_STAFF_2FA}
    />
  );
}
