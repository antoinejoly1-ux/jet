import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { findInvitation } from "@/lib/services/invitations";
import { acceptInvitationAction } from "./actions";

export default async function InvitePage({ params, searchParams }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const { error } = await searchParams;
  const t = await getTranslations("invite");
  const { state, invitation } = await findInvitation(db, token);

  if (state !== "valid" || !invitation) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-bold tracking-tight">{t("unavailableTitle")}</h1>
        <p className="text-muted text-sm">{t(`states.${state}`)}</p>
        <Button asChild variant="secondary">
          <Link href="/sign-in">{t("goToSignIn")}</Link>
        </Button>
      </div>
    );
  }

  const viewer = await getViewer();
  const here = `/invite/${token}`;
  const target = invitation.ownerName ?? t(`staffRoles.${invitation.staffRole ?? "admin"}`);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted mt-1 text-sm">{t("body", { target, email: invitation.email })}</p>
      </div>
      {typeof error === "string" ? (
        <Alert tone="danger">{t(`errors.${error === "email_mismatch" ? "email_mismatch" : "generic"}`)}</Alert>
      ) : null}
      {!viewer ? (
        <div className="flex flex-col gap-3">
          <Button asChild>
            <Link href={`/sign-up?next=${encodeURIComponent(here)}&email=${encodeURIComponent(invitation.email)}`}>
              {t("createAccount")}
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={`/sign-in?next=${encodeURIComponent(here)}&email=${encodeURIComponent(invitation.email)}`}>
              {t("signIn")}
            </Link>
          </Button>
        </div>
      ) : viewer.email.toLowerCase() === invitation.email ? (
        <form action={acceptInvitationAction.bind(null, token)}>
          <Button type="submit" className="w-full">
            {t("accept")}
          </Button>
        </form>
      ) : (
        <Alert tone="danger">{t("wrongAccount", { email: invitation.email, current: viewer.email })}</Alert>
      )}
    </div>
  );
}
