"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import type { SecretState } from "@/app/(admin)/admin/settings/developers/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import { idle, submitted, type FormState } from "@/lib/forms";

type SecretAction = (s: SecretState, d: FormData) => Promise<SecretState>;

function OneTimeSecret({ secret, note }: { secret: string; note: string }) {
  const t = useTranslations("developers");
  const [copied, setCopied] = useState(false);
  return (
    <Alert tone="success">
      <p className="font-semibold">{note}</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="bg-surface min-w-0 flex-1 truncate rounded px-2 py-1 font-mono text-xs">{secret}</code>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(secret);
            setCopied(true);
          }}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? t("copied") : t("copy")}
        </Button>
      </div>
    </Alert>
  );
}

function Checkboxes({
  name,
  options,
  label,
}: {
  name: string;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      {options.map((o) => (
        <label key={o.value} className="flex items-center gap-2 text-sm">
          <input type="checkbox" name={name} value={o.value} className="accent-accent size-4" />
          <span>{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

const asForm = (s: SecretState): FormState => (s.status === "created" ? idle : s);

export function ApiKeyForm({ action, scopes }: { action: SecretAction; scopes: { value: string; label: string }[] }) {
  const t = useTranslations("developers");
  const tf = useTranslations("formErrors");
  const [state, formAction, pending] = useActionState(action, idle);
  const form = asForm(state);
  const err = (f: string) => (form.status === "error" && form.fields?.[f] ? tf(`fields.${f}`) : undefined);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.status === "created" ? <OneTimeSecret secret={state.secret} note={t("keyCreated")} /> : null}
      <FormAlert state={form} />
      <Field
        id="key-name"
        name="name"
        label={t("keyName")}
        placeholder={t("keyNamePlaceholder")}
        defaultValue={submitted(form, "name")}
        error={err("name")}
      />
      <Checkboxes name="scopes" label={t("scopes")} options={scopes} />
      {err("scopes") ? <p className="text-danger text-xs font-medium">{t("pickOne")}</p> : null}
      <div>
        <Button type="submit" disabled={pending}>
          {t("createKey")}
        </Button>
      </div>
    </form>
  );
}

export function WebhookForm({ action, events }: { action: SecretAction; events: { value: string; label: string }[] }) {
  const t = useTranslations("developers");
  const tf = useTranslations("formErrors");
  const [state, formAction, pending] = useActionState(action, idle);
  const form = asForm(state);
  const err = (f: string) => (form.status === "error" && form.fields?.[f] ? tf(`fields.${f}`) : undefined);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.status === "created" ? <OneTimeSecret secret={state.secret} note={t("secretCreated")} /> : null}
      <FormAlert state={form} />
      <Field
        id="hook-name"
        name="name"
        label={t("hookName")}
        defaultValue={submitted(form, "name")}
        error={err("name")}
      />
      <Field
        id="hook-url"
        name="url"
        type="url"
        label={t("url")}
        hint={t("urlHint")}
        placeholder="https://"
        defaultValue={submitted(form, "url")}
        error={err("url")}
      />
      <Checkboxes name="events" label={t("events")} options={events} />
      {err("events") ? <p className="text-danger text-xs font-medium">{t("pickOne")}</p> : null}
      <div>
        <Button type="submit" disabled={pending}>
          {t("createHook")}
        </Button>
      </div>
    </form>
  );
}

export function RevokeKeyButton({ action }: { action: (s: FormState) => Promise<FormState> }) {
  const t = useTranslations("developers");
  const tc = useTranslations("common");
  const [state, formAction] = useActionState(action, idle);
  return (
    <form action={formAction}>
      <FormAlert state={state} />
      <ConfirmButton
        variant="ghost"
        question={t("revokeQuestion")}
        confirmLabel={t("revoke")}
        cancelLabel={tc("cancel")}
      >
        {t("revoke")}
      </ConfirmButton>
    </form>
  );
}

export function TestHookButton({ action }: { action: (s: FormState) => Promise<FormState> }) {
  const t = useTranslations("developers");
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {t("sendTest")}
      </Button>
      {state.status === "success" ? (
        <span className="text-success text-sm font-medium">{t("testOk", { status: state.message ?? "" })}</span>
      ) : null}
      {state.status === "error" ? (
        <span className="text-danger text-sm font-medium">
          {t("testFailed", { detail: state.values?.detail ?? "" })}
        </span>
      ) : null}
    </form>
  );
}
