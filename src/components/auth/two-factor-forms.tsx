"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { authClient } from "@/lib/auth/auth-client";

/** Second step of sign-in for accounts with 2FA. */
export function TwoFactorVerifyForm() {
  const t = useTranslations("twoFactor");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const code = String(form.get("code") ?? "").replace(/\s/g, "");
    setPending(true);
    const { error } = await authClient.twoFactor.verifyTotp({ code, trustDevice: form.get("trust") === "on" });
    setPending(false);
    if (error) setError(t("invalidCode"));
    // Full page load on purpose: /start is a route handler that picks the landing side.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    else window.location.assign("/start");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <h1 className="text-xl font-bold tracking-tight">{t("verifyTitle")}</h1>
      <p className="text-muted text-sm">{t("verifyBody")}</p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field id="code" name="code" inputMode="numeric" autoComplete="one-time-code" label={t("code")} required />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="trust" className="size-4" />
        {t("trustDevice")}
      </label>
      <Button type="submit" disabled={pending}>
        {t("verify")}
      </Button>
    </form>
  );
}

/**
 * Turns on authenticator-app 2FA: shows the setup key and link, then asks for
 * a first code to prove the app is set up before 2FA is enforced.
 */
export function TwoFactorSetup({ hasPassword }: { hasPassword: boolean }) {
  const t = useTranslations("twoFactor");
  const router = useRouter();
  const [step, setStep] = useState<"start" | "verify">("start");
  const [uri, setUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onStart(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get("password") ?? "") || undefined;
    setPending(true);
    setError(null);
    const { data, error } = await authClient.twoFactor.enable({ password, method: "totp" });
    setPending(false);
    if (error || !data || data.method !== "totp") {
      setError(t("enableFailed"));
      return;
    }
    setUri(data.totpURI);
    setBackupCodes(data.backupCodes);
    setStep("verify");
  }

  async function onVerify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code") ?? "").replace(/\s/g, "");
    setPending(true);
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (error) {
      setError(t("invalidCode"));
      return;
    }
    router.refresh();
  }

  const secret = uri ? new URL(uri).searchParams.get("secret") : null;

  if (step === "start") {
    return (
      <form onSubmit={onStart} className="flex flex-col gap-4" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {hasPassword ? (
          <Field
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            label={t("confirmPassword")}
            required
          />
        ) : null}
        <Button type="submit" disabled={pending} className="self-start">
          {t("start")}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={onVerify} className="flex flex-col gap-4" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm">
        <li>
          {t("step1")}{" "}
          {uri ? (
            <a href={uri} className="text-accent font-semibold hover:underline">
              {t("openInApp")}
            </a>
          ) : null}
          {secret ? (
            <code className="bg-surface-muted tabular mt-2 block rounded-md px-3 py-2 font-mono text-sm break-all">
              {secret}
            </code>
          ) : null}
        </li>
        <li>
          {t("step2")}
          <ul className="tabular mt-2 grid grid-cols-2 gap-1 font-mono text-sm">
            {backupCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </li>
        <li>{t("step3")}</li>
      </ol>
      <Field id="code" name="code" inputMode="numeric" autoComplete="one-time-code" label={t("code")} required />
      <Button type="submit" disabled={pending} className="self-start">
        {t("finish")}
      </Button>
    </form>
  );
}
