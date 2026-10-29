"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { AnimatedIcon } from "@/components/animated-icons/AnimatedIcon";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { authClient } from "@/lib/auth/auth-client";
import { GoogleButton } from "./google-button";
import { PasswordField } from "./password-field";

export function SignUpForm({
  next,
  googleEnabled,
  defaultEmail,
  call,
}: {
  next: string;
  googleEnabled: boolean;
  defaultEmail?: string;
  /** The team's phone, to ask for an invitation. */
  call: { href: string; label: string } | null;
}) {
  const t = useTranslations("auth");
  const [error, setError] = useState<string | null>(null);
  const [tooShort, setTooShort] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  /** What was typed, kept so « Recommencer » brings it back to fix the address. */
  const [typed, setTyped] = useState({ name: "", email: defaultEmail ?? "" });
  const [pending, setPending] = useState(false);
  const invited = Boolean(defaultEmail);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setTyped({ name, email });
    if (!name || !email) {
      setError(t("errors.fillAll"));
      return;
    }
    setError(null);
    setTooShort(password.length < 10);
    if (password.length < 10) return;
    setPending(true);
    const { error } = await authClient.signUp.email({ name, email, password, callbackURL: next });
    setPending(false);
    if (error) setError(error.code === "USER_ALREADY_EXISTS" ? t("errors.emailTaken") : t("errors.generic"));
    else setSentTo(email);
  }

  if (sentTo) {
    return (
      <div className="flex flex-col gap-4">
        <span className="bg-accent/10 text-accent flex size-12 items-center justify-center rounded-full">
          <AnimatedIcon name="mail" size={22} />
        </span>
        <h1 className="text-[2rem] leading-tight font-light tracking-tight">{t("checkInboxTitle")}</h1>
        <p className="text-muted text-[15px] leading-relaxed">{t("checkInboxBody", { email: sentTo })}</p>
        <p className="text-muted text-sm">
          {t("wrongAddress")}{" "}
          <button
            type="button"
            onClick={() => setSentTo(null)}
            className="text-accent -my-3 inline-block py-3 font-semibold hover:underline"
          >
            {t("startOver")}
          </button>
        </p>
        <Link href="/sign-in" className="text-accent -my-3 self-start py-3 text-sm font-semibold hover:underline">
          {t("backToSignIn")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h1 className="text-[2rem] leading-tight font-light tracking-tight">{t("signUpTitle")}</h1>
        <p className="text-muted mt-2 text-[15px] leading-relaxed">
          {invited ? t("signUpSubtitleInvited") : t("signUpSubtitle")}
        </p>
      </div>
      {invited ? null : (
        <div className="border-border bg-surface rounded-[18px] border px-5 py-4 text-sm leading-relaxed">
          <p className="font-medium">{t("inviteOnlyTitle")}</p>
          <p className="text-muted mt-1">{t("inviteOnlyBody")}</p>
          {call ? (
            <a href={call.href} className="ai-trigger text-accent mt-2 inline-flex items-center gap-2 font-semibold">
              <AnimatedIcon name="phone" size={16} />
              {call.label}
            </a>
          ) : null}
        </div>
      )}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <Field id="name" name="name" autoComplete="name" label={t("name")} defaultValue={typed.name} required />
        <Field
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          label={t("email")}
          defaultValue={typed.email}
          hint={invited ? undefined : t("emailHint")}
          required
        />
        <PasswordField
          id="password"
          name="password"
          autoComplete="new-password"
          label={t("password")}
          hint={t("passwordHint")}
          error={tooShort ? t("errors.passwordTooShort") : undefined}
          required
        />
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? t("creating") : t("createAccount")}
        </Button>
      </form>
      {googleEnabled ? (
        <>
          <div className="text-muted flex items-center gap-3 text-xs">
            <span className="bg-border h-px flex-1" />
            {t("or")}
            <span className="bg-border h-px flex-1" />
          </div>
          <GoogleButton callbackURL={next} />
        </>
      ) : null}
      <p className="border-border text-muted border-t pt-6 text-sm">
        {t("haveAccount")}{" "}
        <Link
          href={`/sign-in?next=${encodeURIComponent(next)}`}
          className="text-accent -my-3 inline-block py-3 font-semibold hover:underline"
        >
          {t("signIn")}
        </Link>
      </p>
    </div>
  );
}
