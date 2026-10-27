"use client";

import { Mail } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { authClient } from "@/lib/auth/auth-client";
import { fullPageLoad } from "@/lib/full-page-load";
import { GoogleButton } from "./google-button";

export function SignInForm({
  next,
  googleEnabled,
  defaultEmail,
}: {
  next: string;
  googleEnabled: boolean;
  defaultEmail?: string;
}) {
  const t = useTranslations("auth");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<"password" | "link" | null>(null);

  async function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    setPending("password");
    setError(null);
    const { data, error } = await authClient.signIn.email({ email, password, callbackURL: next });
    setPending(null);
    if (error) {
      setError(error.status === 403 ? t("errors.unverified") : t("errors.invalidCredentials"));
      return;
    }
    // Accounts with 2FA continue to the code screen, then to where they were going.
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      fullPageLoad(`/two-factor?next=${encodeURIComponent(next)}`);
      return;
    }
    fullPageLoad(next);
  }

  async function onMagicLink() {
    if (!email) {
      setError(t("errors.emailRequired"));
      return;
    }
    setPending("link");
    setError(null);
    const { error } = await authClient.signIn.magicLink({ email, callbackURL: next });
    setPending(null);
    if (error) setError(t("errors.generic"));
    else setNotice(t("magicLinkSent", { email }));
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-light tracking-tight">{t("signInTitle")}</h1>
        <p className="text-muted mt-1 text-sm">{t("signInSubtitle")}</p>
      </div>
      {googleEnabled ? (
        <>
          <GoogleButton callbackURL={next} />
          <div className="text-muted flex items-center gap-3 text-xs">
            <span className="bg-border h-px flex-1" />
            {t("or")}
            <span className="bg-border h-px flex-1" />
          </div>
        </>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      <form onSubmit={onPassword} className="flex flex-col gap-4" noValidate>
        <Field
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          label={t("email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <div className="flex flex-col gap-1.5">
          <Field
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            label={t("password")}
            required
          />
          <Link href="/forgot-password" className="text-accent self-end text-xs font-medium hover:underline">
            {t("forgotPassword")}
          </Link>
        </div>
        <Button type="submit" disabled={pending !== null}>
          {pending === "password" ? t("signingIn") : t("signIn")}
        </Button>
      </form>
      <Button type="button" variant="secondary" onClick={onMagicLink} disabled={pending !== null}>
        <Mail aria-hidden />
        {pending === "link" ? t("sending") : t("emailMeALink")}
      </Button>
      <p className="text-muted text-center text-sm">
        {t("noAccount")}{" "}
        <Link href={`/sign-up?next=${encodeURIComponent(next)}`} className="text-accent font-semibold hover:underline">
          {t("createAccount")}
        </Link>
      </p>
    </div>
  );
}
