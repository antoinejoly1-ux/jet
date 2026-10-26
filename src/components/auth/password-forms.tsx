"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { authClient } from "@/lib/auth/auth-client";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    setPending(true);
    // Same answer whether or not the address has an account, so nobody can probe for accounts.
    await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    setPending(false);
    setSent(true);
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{t("forgotTitle")}</h1>
        <p className="text-muted mt-1 text-sm">{t("forgotSubtitle")}</p>
      </div>
      {sent ? (
        <Alert tone="success">{t("resetSent")}</Alert>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Field id="email" name="email" type="email" autoComplete="email" label={t("email")} required />
          <Button type="submit" disabled={pending}>
            {pending ? t("sending") : t("sendResetLink")}
          </Button>
        </form>
      )}
      <Link href="/sign-in" className="text-accent text-center text-sm font-semibold hover:underline">
        {t("backToSignIn")}
      </Link>
    </div>
  );
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  const t = useTranslations("auth");
  const [error, setError] = useState<string | null>(token ? null : t("errors.invalidLink"));
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;
    const newPassword = String(new FormData(e.currentTarget).get("password") ?? "");
    if (newPassword.length < 10) {
      setError(t("errors.passwordTooShort"));
      return;
    }
    setPending(true);
    const { error } = await authClient.resetPassword({ newPassword, token });
    setPending(false);
    if (error) setError(t("errors.invalidLink"));
    else setDone(true);
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-bold tracking-tight">{t("resetTitle")}</h1>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {done ? (
        <>
          <Alert tone="success">{t("resetDone")}</Alert>
          <Button asChild>
            <Link href="/sign-in">{t("signIn")}</Link>
          </Button>
        </>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Field
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            label={t("newPassword")}
            hint={t("passwordHint")}
            required
          />
          <Button type="submit" disabled={pending || !token}>
            {pending ? t("saving") : t("savePassword")}
          </Button>
        </form>
      )}
    </div>
  );
}
