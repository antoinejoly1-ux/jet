import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SignInForm, type SignInNotice } from "@/components/auth/sign-in-form";
import { googleEnabled } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth"))("signInTitle") };
}

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/**
 * A used or expired link lands here with an `error`: a magic link says so
 * itself (`link=magic`); an email-confirmation link carries it inside `next`
 * (Better Auth appends it to the callback URL), so it's taken out of there.
 */
function readNotice(params: Record<string, string | string[] | undefined>): {
  next: string;
  notice: SignInNotice | null;
} {
  const next = safeNext(str(params.next) ?? null);
  if (str(params.reset) === "done") return { next, notice: "resetDone" };
  if (str(params.error)) return { next, notice: str(params.link) === "magic" ? "linkUsed" : "linkExpired" };
  const url = new URL(next, "http://local");
  if (!url.searchParams.has("error")) return { next, notice: null };
  url.searchParams.delete("error");
  url.searchParams.delete("error_description");
  return { next: `${url.pathname}${url.search}`, notice: "linkExpired" };
}

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const { next, notice } = readNotice(params);
  return <SignInForm next={next} googleEnabled={googleEnabled} defaultEmail={str(params.email)} notice={notice} />;
}
