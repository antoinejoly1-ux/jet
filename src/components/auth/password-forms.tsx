"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { authClient } from "@/lib/auth/auth-client";
import { fullPageLoad } from "@/lib/full-page-load";
import { PasswordField } from "./password-field";

export function ForgotPasswordForm({ defaultEmail }: { defaultEmail?: string }) {
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
        <h1 className="text-[2rem] leading-tight font-light tracking-tight">{t("forgotTitle")}</h1>
        <p className="text-muted mt-2 text-[15px] leading-relaxed">{t("forgotSubtitle")}</p>
      </div>
      {sent ? (
        <Alert tone="success">{t("resetSent")}</Alert>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Field
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            label={t("email")}
            defaultValue={defaultEmail}
            required
          />
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? t("sending") : t("sendResetLink")}
          </Button>
        </form>
      )}
      <Link
        href="/sign-in"
        className="text-accent -my-3 self-center py-3 text-center text-sm font-semibold hover:underline"
      >
        {t("backToSignIn")}
      </Link>
    </div>
  );
}

/**
 * Choosing a new password from the emailed link. Better Auth checks the link
 * before sending people here: no token, or `?error=INVALID_TOKEN`, means it
 * was used or expired, which is said up front rather than after typing.
 */
export function ResetPasswordForm({ token }: { token: string | null }) {
  const t = useTranslations("auth");
  const [invalid, setInvalid] = useState(!token);
  const [error, setError] = useState<string | null>(null);
  const [tooShort, setTooShort] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;
    const newPassword = String(new FormData(e.currentTarget).get("password") ?? "");
    setTooShort(newPassword.length < 10);
    if (newPassword.length < 10) return;
    setPending(true);
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword, token });
    if (error) {
      setPending(false);
      if (error.code === "INVALID_TOKEN") setInvalid(true);
      else setError(t("errors.generic"));
      return;
    }
    fullPageLoad("/sign-in?reset=done");
  }

  if (invalid) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-[2rem] leading-tight font-light tracking-tight">{t("resetInvalidTitle")}</h1>
          <p className="text-muted mt-2 text-[15px] leading-relaxed">{t("resetInvalidBody")}</p>
        </div>
        <Button asChild size="lg">
          <Link href="/forgot-password">{t("requestNewLink")}</Link>
        </Button>
        <Link
          href="/sign-in"
          className="text-accent -my-3 self-center py-3 text-center text-sm font-semibold hover:underline"
        >
          {t("backToSignIn")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[2rem] leading-tight font-light tracking-tight">{t("resetTitle")}</h1>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <PasswordField
          id="password"
          name="password"
          autoComplete="new-password"
          label={t("newPassword")}
          hint={t("passwordHint")}
          error={tooShort ? t("errors.passwordTooShort") : undefined}
          autoFocus
          required
        />
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? t("saving") : t("savePassword")}
        </Button>
      </form>
    </div>
  );
}
