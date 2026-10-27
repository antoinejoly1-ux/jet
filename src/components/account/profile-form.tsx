"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { saveProfileAction } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import { idle, type FormState } from "@/lib/forms";

/** First and last name, in Settings. The same service the welcome tour uses. */
export function ProfileForm({
  firstName,
  lastName,
  disabled,
}: {
  firstName: string;
  lastName: string;
  disabled?: boolean;
}) {
  const t = useTranslations("account");
  const tw = useTranslations("welcome.name");
  const [state, setState] = useState<FormState>(idle);
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        start(async () => {
          const result = await saveProfileAction({
            firstName: String(data.get("firstName") ?? ""),
            lastName: String(data.get("lastName") ?? ""),
          });
          setState(result.status === "success" ? { status: "success", message: t("profileSaved") } : result);
        });
      }}
    >
      <FormAlert state={state} />
      <fieldset disabled={disabled} className="grid gap-5 sm:grid-cols-2">
        <Field
          id="firstName"
          name="firstName"
          label={tw("first")}
          defaultValue={firstName}
          autoComplete="given-name"
          required
        />
        <Field id="lastName" name="lastName" label={tw("last")} defaultValue={lastName} autoComplete="family-name" />
      </fieldset>
      <div>
        <Button type="submit" variant="secondary" disabled={pending || disabled}>
          {t("saveProfile")}
        </Button>
      </div>
    </form>
  );
}
