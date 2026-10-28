"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatedIcon } from "@/components/animated-icons/AnimatedIcon";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { authClient } from "@/lib/auth/auth-client";
import { fullPageLoad } from "@/lib/full-page-load";
import { GoogleButton } from "./google-button";
import { PasswordField } from "./password-field";

/** The address last used to sign in on this device, so returning people only type their password. */
const LAST_EMAIL = "um:last-email";

/** Why someone landed here: a link that no longer works, or a password just changed. */
export type SignInNotice = "linkUsed" | "linkExpired" | "resetDone";

export function SignInForm({
  next,
  googleEnabled,
  defaultEmail,
  notice: arrival = null,
}: {
  next: string;
  googleEnabled: boolean;
  defaultEmail?: string;
  notice?: SignInNotice | null;
}) {
  const t = useTranslations("auth");
  const router = useRouter();
  const emailInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(
    arrival === "linkUsed" ? t("errors.linkUsed") : arrival === "linkExpired" ? t("errors.linkExpired") : null,
  );
  const [notice, setNotice] = useState<string | null>(arrival === "resetDone" ? t("resetSuccess") : null);
  const [pending, setPending] = useState<"password" | "link" | null>(null);

  useEffect(() => {
    if (defaultEmail) return;
    try {
      const last = localStorage.getItem(LAST_EMAIL);
      if (last && emailInput.current && !emailInput.current.value) emailInput.current.value = last;
    } catch {}
  }, [defaultEmail]);
  const typedEmail = () => emailInput.current?.value.trim() ?? "";
  const remember = (email: string) => {
    try {
      localStorage.setItem(LAST_EMAIL, email);
    } catch {}
  };

  async function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    const email = typedEmail();
    if (!email || !password) {
      setError(t("errors.fillBoth"));
      return;
    }
    setPending("password");
    setError(null);
    setNotice(null);
    const { data, error } = await authClient.signIn.email({ email, password, callbackURL: next });
    setPending(null);
    if (error) {
      setError(error.status === 403 ? t("errors.unverified") : t("errors.invalidCredentials"));
      return;
    }
    remember(email);
    // Accounts with 2FA continue to the code screen, then to where they were going.
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      fullPageLoad(`/two-factor?next=${encodeURIComponent(next)}`);
      return;
    }
    fullPageLoad(next);
  }

  async function onMagicLink() {
    const email = typedEmail();
    if (!email) {
      setError(t("errors.emailRequired"));
      emailInput.current?.focus();
      return;
    }
    setPending("link");
    setError(null);
    setNotice(null);
    // A used or expired link comes back to this screen, which then says so.
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: next,
      errorCallbackURL: `/sign-in?link=magic&next=${encodeURIComponent(next)}`,
    });
    setPending(null);
    if (error) setError(t("errors.generic"));
    else {
      remember(email);
      setNotice(t("magicLinkSent", { email }));
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h1 className="text-[2rem] leading-tight font-light tracking-tight">{t("signInTitle")}</h1>
        <p className="text-muted mt-2 text-[15px]">{t("signInSubtitle")}</p>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      <form onSubmit={onPassword} className="flex flex-col gap-5" noValidate>
        <Field
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          label={t("email")}
          ref={emailInput}
          defaultValue={defaultEmail}
          required
        />
        <PasswordField
          id="password"
          name="password"
          autoComplete="current-password"
          label={t("password")}
          required
          aside={
            <Link
              href="/forgot-password"
              onClick={(e) => {
                // Carries the typed address over, so it isn't typed twice.
                const email = typedEmail();
                if (!email) return;
                e.preventDefault();
                router.push(`/forgot-password?email=${encodeURIComponent(email)}`);
              }}
              className="text-accent -my-3.5 inline-block py-3.5 text-xs font-medium hover:underline"
            >
              {t("forgotPassword")}
            </Link>
          }
        />
        <Button type="submit" size="lg" disabled={pending !== null}>
          {pending === "password" ? t("signingIn") : t("signIn")}
        </Button>
      </form>
      <div className="text-muted flex items-center gap-3 text-xs">
        <span className="bg-border h-px flex-1" />
        {t("or")}
        <span className="bg-border h-px flex-1" />
      </div>
      <div className="flex flex-col gap-3">
        <Button
          type="button"
          variant="secondary"
          className="ai-trigger"
          onClick={onMagicLink}
          disabled={pending !== null}
        >
          <AnimatedIcon name="mail" size={18} />
          {pending === "link" ? t("sending") : t("emailMeALink")}
        </Button>
        {googleEnabled ? <GoogleButton callbackURL={next} /> : null}
        <p className="text-muted text-xs leading-relaxed">{t("magicLinkHint")}</p>
      </div>
      <p className="border-border text-muted border-t pt-6 text-sm">
        {t("noAccount")}{" "}
        <Link
          href={`/sign-up?next=${encodeURIComponent(next)}`}
          className="text-accent -my-3 inline-block py-3 font-semibold hover:underline"
        >
          {t("createAccount")}
        </Link>
      </p>
    </div>
  );
}
