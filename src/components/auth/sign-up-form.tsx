"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { authClient } from "@/lib/auth/auth-client";
import { GoogleButton } from "./google-button";

export function SignUpForm({
  next,
  googleEnabled,
  defaultEmail,
}: {
  next: string;
  googleEnabled: boolean;
  defaultEmail?: string;
}) {
  const t = useTranslations("auth");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (password.length < 10) {
      setError(t("errors.passwordTooShort"));
      return;
    }
    setPending(true);
    setError(null);
    const { error } = await authClient.signUp.email({ name, email, password, callbackURL: next });
    setPending(false);
    if (error) setError(error.code === "USER_ALREADY_EXISTS" ? t("errors.emailTaken") : t("errors.generic"));
    else setSentTo(email);
  }

  if (sentTo) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-bold tracking-tight">{t("checkInboxTitle")}</h1>
        <p className="text-muted text-sm">{t("checkInboxBody", { email: sentTo })}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{t("signUpTitle")}</h1>
        <p className="text-muted mt-1 text-sm">{t("signUpSubtitle")}</p>
      </div>
      {googleEnabled ? <GoogleButton callbackURL={next} /> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field id="name" name="name" autoComplete="name" label={t("name")} required />
        <Field
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          label={t("email")}
          defaultValue={defaultEmail}
          required
        />
        <Field
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          label={t("password")}
          hint={t("passwordHint")}
          required
        />
        <Button type="submit" disabled={pending}>
          {pending ? t("creating") : t("createAccount")}
        </Button>
      </form>
      <p className="text-muted text-center text-sm">
        {t("haveAccount")}{" "}
        <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="text-accent font-semibold hover:underline">
          {t("signIn")}
        </Link>
      </p>
    </div>
  );
}
