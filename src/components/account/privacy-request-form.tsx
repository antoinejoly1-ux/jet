"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { SelectField } from "@/components/ui/select";
import { TextareaField } from "@/components/ui/textarea";
import { idle, submitted, type FormState } from "@/lib/forms";

export function PrivacyRequestForm({ action }: { action: (s: FormState, d: FormData) => Promise<FormState> }) {
  const t = useTranslations("account");
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <FormAlert state={state} />
      <SelectField
        id="privacy-kind"
        name="kind"
        label={t("privacyKind")}
        defaultValue={submitted(state, "kind", "correction")}
      >
        {(["correction", "access", "deletion", "portability"] as const).map((k) => (
          <option key={k} value={k}>
            {t(`privacyKinds.${k}`)}
          </option>
        ))}
      </SelectField>
      <TextareaField
        id="privacy-details"
        name="details"
        label={t("privacyDetails")}
        rows={3}
        defaultValue={submitted(state, "details")}
      />
      <div>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {t("privacySend")}
        </Button>
      </div>
    </form>
  );
}
