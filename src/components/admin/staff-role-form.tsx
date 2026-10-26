"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { Select } from "@/components/ui/select";
import { idle, submitted, type FormState } from "@/lib/forms";

export function StaffRoleForm({
  action,
  current,
  name,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  current: string;
  name: string;
}) {
  const t = useTranslations("team");
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <Select
          key={submitted(state, "role", current)}
          name="role"
          defaultValue={submitted(state, "role", current)}
          aria-label={t("roleFor", { name })}
          className="h-9 w-40"
        >
          {(["admin", "finance", "dispatcher"] as const).map((r) => (
            <option key={r} value={r}>
              {t(`roles.${r}`)}
            </option>
          ))}
          <option value="none">{t("removeFromTeam")}</option>
        </Select>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {t("save")}
        </Button>
      </div>
      {state.status === "error" ? <FormAlert state={state} /> : null}
    </form>
  );
}
