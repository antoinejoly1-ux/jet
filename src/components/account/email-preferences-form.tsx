"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { idle, type FormState } from "@/lib/forms";

export function EmailPreferencesForm({
  action,
  preferences,
  disabled,
}: {
  action: (s: FormState, d: FormData) => Promise<FormState>;
  preferences: { type: string; email: boolean }[];
  disabled?: boolean;
}) {
  const t = useTranslations("account");
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} className="mt-3 flex flex-col gap-3">
      <FormAlert state={state} />
      <fieldset className="flex flex-col gap-1" disabled={disabled}>
        <legend className="sr-only">{t("emailsTitle")}</legend>
        {preferences.map((p) => (
          <label key={p.type} className="hover:bg-surface-muted -mx-2 flex items-start gap-3 rounded-md px-2 py-2">
            <input
              type="checkbox"
              name="on"
              value={p.type}
              defaultChecked={p.email}
              className="accent-accent mt-0.5 size-4 shrink-0"
            />
            <span className="text-sm">
              <span className="block font-medium">{t(`emailTypes.${p.type}.label`)}</span>
              <span className="text-muted block">{t(`emailTypes.${p.type}.hint`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="text-muted text-xs">{t("emailsAlwaysOn")}</p>
      <div>
        <Button type="submit" size="sm" variant="secondary" disabled={pending || disabled}>
          {t("saveEmails")}
        </Button>
      </div>
    </form>
  );
}
