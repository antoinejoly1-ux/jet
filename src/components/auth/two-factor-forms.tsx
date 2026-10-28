"use client";

import { Check, Copy, Download, KeyRound, ShieldCheck, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CodeInput } from "@/components/ui/code-input";
import { Field } from "@/components/ui/field";
import { authClient } from "@/lib/auth/auth-client";
import { PasswordField } from "./password-field";
import { fullPageLoad } from "@/lib/full-page-load";

/**
 * Second step of every sign-in for accounts with 2FA. The code submits itself
 * at the sixth digit, the device is trusted for 30 days by default, and a
 * backup code is one tap away for a lost phone.
 */
export function TwoFactorChallenge({ next }: { next: string }) {
  const t = useTranslations("twoFactor");
  const [mode, setMode] = useState<"app" | "backup">("app");
  const [trust, setTrust] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const messageFor = (code: string | undefined) =>
    code === "INVALID_TWO_FACTOR_COOKIE"
      ? t("sessionExpired")
      : code === "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE" || code === "ACCOUNT_TEMPORARILY_LOCKED"
        ? t("tooManyAttempts")
        : t("invalidCode");

  async function verifyApp(code: string) {
    setPending(true);
    setError(null);
    const { error } = await authClient.twoFactor.verifyTotp({ code, trustDevice: trust });
    if (error) {
      setPending(false);
      setAttempt((n) => n + 1);
      setError(messageFor(error.code));
      return;
    }
    fullPageLoad(next);
  }

  async function verifyBackup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("backup") ?? "").trim();
    setPending(true);
    setError(null);
    const { error } = await authClient.twoFactor.verifyBackupCode({ code, trustDevice: trust });
    if (error) {
      setPending(false);
      setError(error.code === "INVALID_BACKUP_CODE" ? t("invalidBackupCode") : messageFor(error.code));
      return;
    }
    fullPageLoad(next);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-surface-muted flex size-11 items-center justify-center rounded-full">
        <ShieldCheck className="size-5" aria-hidden />
      </div>
      <div>
        <h1 className="text-[2rem] leading-tight font-light tracking-tight">{t("verifyTitle")}</h1>
        <p className="text-muted mt-2 text-[15px] leading-relaxed">
          {mode === "app" ? t("verifyBody") : t("backupBody")}
        </p>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {mode === "app" ? (
        <CodeInput
          key={attempt}
          label={t("code")}
          onComplete={verifyApp}
          disabled={pending}
          invalid={attempt > 0 && !!error}
        />
      ) : (
        <form onSubmit={verifyBackup} className="flex flex-col gap-4" noValidate>
          <Field id="backup" name="backup" label={t("backupCode")} autoComplete="off" autoFocus required />
          <Button type="submit" disabled={pending}>
            {t("verify")}
          </Button>
        </form>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} className="size-4" />
        {t("trustDevice")}
      </label>
      <button
        type="button"
        onClick={() => {
          setMode(mode === "app" ? "backup" : "app");
          setError(null);
        }}
        className="text-accent self-start text-sm font-semibold hover:underline"
      >
        {mode === "app" ? t("useBackupCode") : t("useApp")}
      </button>
    </div>
  );
}

type Step = "intro" | "scan" | "confirm" | "codes";

/**
 * Guided 2FA setup: confirm it's you, scan, type one code, save backup codes.
 * Each step is one decision on one screen.
 */
export function TwoFactorSetup({
  hasPassword,
  next,
  required,
}: {
  hasPassword: boolean;
  next: string;
  required: boolean;
}) {
  const t = useTranslations("twoFactor");
  const [step, setStep] = useState<Step>("intro");
  const [uri, setUri] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState<"key" | "codes" | null>(null);
  const [saved, setSaved] = useState(false);

  const secret = uri ? new URL(uri).searchParams.get("secret") : null;
  const groupedSecret = secret?.match(/.{1,4}/g)?.join(" ");

  useEffect(() => {
    if (!uri) return;
    QRCode.toDataURL(uri, { margin: 1, width: 440, errorCorrectionLevel: "M" }).then(setQr);
  }, [uri]);

  async function start(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    const password = e ? String(new FormData(e.currentTarget).get("password") ?? "") || undefined : undefined;
    setPending(true);
    setError(null);
    const { data, error } = await authClient.twoFactor.enable({ password, method: "totp" });
    setPending(false);
    if (error || !data || data.method !== "totp") {
      setError(hasPassword ? t("wrongPassword") : t("enableFailed"));
      return;
    }
    setUri(data.totpURI);
    setBackupCodes(data.backupCodes);
    setStep("scan");
  }

  async function confirm(code: string) {
    setPending(true);
    setError(null);
    const { error } = await authClient.twoFactor.verifyTotp({ code, trustDevice: true });
    setPending(false);
    if (error) {
      setAttempt((n) => n + 1);
      setError(t("invalidCode"));
      return;
    }
    setStep("codes");
  }

  async function copy(text: string, what: "key" | "codes") {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  }

  function download() {
    const blob = new Blob([`${t("codesFileHeader")}\n\n${backupCodes.join("\n")}\n`], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "jet-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const stepIndex = { intro: 0, scan: 1, confirm: 2, codes: 3 }[step];

  return (
    <div className="flex flex-col gap-5">
      <ol aria-label={t("progress")} className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className={`h-1 flex-1 rounded-full ${i <= stepIndex ? "bg-primary" : "bg-surface-muted"}`}>
            <span className="sr-only">{i < stepIndex ? t("stepDone") : i === stepIndex ? t("stepCurrent") : ""}</span>
          </li>
        ))}
      </ol>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {step === "intro" ? (
        <>
          <div>
            <h1 className="text-[2rem] leading-tight font-light tracking-tight">{t("setupTitle")}</h1>
            <p className="text-muted mt-2 text-[15px] leading-relaxed">
              {required ? t("setupRequiredBody") : t("setupBody")}
            </p>
          </div>
          <ul className="text-muted flex flex-col gap-2 text-sm">
            <li className="flex gap-2">
              <Smartphone className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t("setupNeedApp")}
            </li>
            <li className="flex gap-2">
              <KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t("setupOncePerDevice")}
            </li>
          </ul>
          {hasPassword ? (
            <form onSubmit={start} className="flex flex-col gap-4" noValidate>
              <PasswordField
                id="password"
                name="password"
                autoComplete="current-password"
                label={t("confirmPassword")}
                autoFocus
                required
              />
              <Button type="submit" disabled={pending}>
                {t("start")}
              </Button>
            </form>
          ) : (
            <Button type="button" onClick={() => start()} disabled={pending}>
              {t("start")}
            </Button>
          )}
        </>
      ) : null}

      {step === "scan" ? (
        <>
          <div>
            <h1 className="text-[2rem] leading-tight font-light tracking-tight">{t("scanTitle")}</h1>
            <p className="text-muted mt-2 text-[15px] leading-relaxed">{t("scanBody")}</p>
          </div>
          <div className="flex justify-center">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element -- a generated data URL, not a remote image
              <img src={qr} alt={t("qrAlt")} width={220} height={220} className="rounded-md bg-white p-2" />
            ) : (
              <div className="bg-surface-muted size-[220px] animate-pulse rounded-md" />
            )}
          </div>
          {uri ? (
            <Button asChild variant="secondary" className="sm:hidden">
              <a href={uri}>{t("openInApp")}</a>
            </Button>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <p className="text-muted text-xs">{t("manualKey")}</p>
            <div className="bg-surface-muted flex items-center gap-2 rounded-md px-3 py-2">
              <code data-testid="totp-secret" className="tabular flex-1 font-mono text-sm leading-6 break-normal">
                {groupedSecret}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => secret && copy(secret, "key")}
                aria-label={t("copyKey")}
              >
                {copied === "key" ? <Check aria-hidden /> : <Copy aria-hidden />}
              </Button>
            </div>
          </div>
          <Button type="button" onClick={() => setStep("confirm")}>
            {t("next")}
          </Button>
        </>
      ) : null}

      {step === "confirm" ? (
        <>
          <div>
            <h1 className="text-[2rem] leading-tight font-light tracking-tight">{t("confirmTitle")}</h1>
            <p className="text-muted mt-2 text-[15px] leading-relaxed">{t("confirmBody")}</p>
          </div>
          <CodeInput
            key={attempt}
            label={t("code")}
            onComplete={confirm}
            disabled={pending}
            invalid={attempt > 0 && !!error}
          />
          <button
            type="button"
            onClick={() => setStep("scan")}
            className="text-accent self-start text-sm font-semibold hover:underline"
          >
            {t("back")}
          </button>
        </>
      ) : null}

      {step === "codes" ? (
        <>
          <div>
            <h1 className="text-[2rem] leading-tight font-light tracking-tight">{t("codesTitle")}</h1>
            <p className="text-muted mt-2 text-[15px] leading-relaxed">{t("codesBody")}</p>
          </div>
          <ul
            data-testid="backup-codes"
            className="bg-surface-muted tabular grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-md p-4 font-mono text-sm"
          >
            {backupCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => copy(backupCodes.join("\n"), "codes")}>
              {copied === "codes" ? <Check aria-hidden /> : <Copy aria-hidden />}
              {t("copyCodes")}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={download}>
              <Download aria-hidden />
              {t("downloadCodes")}
            </Button>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="size-4" />
            {t("codesSaved")}
          </label>
          <Button type="button" disabled={!saved} onClick={() => fullPageLoad(next)}>
            {t("finish")}
          </Button>
        </>
      ) : null}
    </div>
  );
}
