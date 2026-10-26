"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import { SelectField } from "@/components/ui/select";
import { TextareaField } from "@/components/ui/textarea";
import { idle, submitted, type FormState } from "@/lib/forms";
import type { AircraftOption } from "./flight-form";

export const MAINTENANCE_TYPES = ["inspection", "unscheduled", "upgrade", "other"] as const;

export type MaintenanceDefaults = {
  aircraftId: string;
  type: string;
  title: string;
  dueOn: string;
  startsAt: string;
  endsAt: string;
  notes: string;
};

export function MaintenanceForm({
  action,
  aircraft,
  defaults,
}: {
  action: (s: FormState, d: FormData) => Promise<FormState>;
  aircraft: AircraftOption[];
  defaults?: MaintenanceDefaults;
}) {
  const t = useTranslations("maintenance");
  const tf = useTranslations("formErrors");
  const [state, formAction, pending] = useActionState(action, idle);
  const err = (f: string) => (state.status === "error" && state.fields?.[f] ? tf(`fields.${f}`) : undefined);
  const editing = !!defaults;

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5" noValidate>
      <FormAlert state={state} />
      <div className="grid gap-5 sm:grid-cols-2">
        {editing ? (
          <input type="hidden" name="aircraftId" value={defaults.aircraftId} />
        ) : (
          <SelectField
            id="aircraftId"
            name="aircraftId"
            label={t("aircraft")}
            defaultValue={submitted(state, "aircraftId")}
            error={err("aircraftId")}
          >
            <option value="" disabled>
              {t("chooseAircraft")}
            </option>
            {aircraft.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </SelectField>
        )}
        <SelectField
          id="type"
          name="type"
          label={t("type")}
          defaultValue={submitted(state, "type", defaults?.type ?? "inspection")}
          error={err("type")}
        >
          {MAINTENANCE_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`types.${type}`)}
            </option>
          ))}
        </SelectField>
        <div className="sm:col-span-2">
          <Field
            id="title"
            name="title"
            label={t("titleField")}
            placeholder={t("titlePlaceholder")}
            defaultValue={submitted(state, "title", defaults?.title)}
            error={err("title")}
            required
          />
        </div>
        <Field
          id="startsAt"
          name="startsAt"
          type="datetime-local"
          label={t("startsAt")}
          hint={t("windowHint")}
          defaultValue={submitted(state, "startsAt", defaults?.startsAt)}
          error={err("startsAt")}
        />
        <Field
          id="endsAt"
          name="endsAt"
          type="datetime-local"
          label={t("endsAt")}
          defaultValue={submitted(state, "endsAt", defaults?.endsAt)}
          error={err("endsAt")}
        />
        <Field
          id="dueOn"
          name="dueOn"
          type="date"
          label={t("dueOn")}
          hint={t("dueOnHint")}
          defaultValue={submitted(state, "dueOn", defaults?.dueOn)}
          error={err("dueOn")}
        />
        <div className="sm:col-span-2">
          <TextareaField
            id="notes"
            name="notes"
            label={t("notes")}
            rows={3}
            defaultValue={submitted(state, "notes", defaults?.notes)}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/admin/maintenance">{t("cancel")}</Link>
        </Button>
      </div>
    </form>
  );
}
