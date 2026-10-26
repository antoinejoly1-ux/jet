"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import { SelectField } from "@/components/ui/select";
import { TextareaField } from "@/components/ui/textarea";
import { idle, submitted, type FormState } from "@/lib/forms";

type Action = (s: FormState, d: FormData) => Promise<FormState>;

export function CloseRequestForm({ action, id }: { action: Action; id: string }) {
  const t = useTranslations("privacyAdmin");
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} className="mt-3 flex flex-col gap-3">
      <FormAlert state={state} />
      <TextareaField
        id={`response-${id}`}
        name="response"
        label={t("response")}
        rows={2}
        required
        defaultValue={submitted(state, "response")}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="status" value="done" size="sm" disabled={pending}>
          {t("markDone")}
        </Button>
        <Button type="submit" name="status" value="refused" size="sm" variant="ghost" disabled={pending}>
          {t("refuse")}
        </Button>
      </div>
    </form>
  );
}

export function IncidentForm({ action }: { action: Action }) {
  const t = useTranslations("privacyAdmin");
  const tf = useTranslations("formErrors");
  const [state, formAction, pending] = useActionState(action, idle);
  const err = (f: string) => (state.status === "error" && state.fields?.[f] ? tf(`fields.${f}`) : undefined);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormAlert state={state} />
      {state.status === "success" ? <p className="text-success text-sm font-medium">{t("incidentSaved")}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="occurredOn"
          name="occurredOn"
          type="date"
          label={t("occurredOn")}
          defaultValue={submitted(state, "occurredOn", today)}
          error={err("occurredOn")}
        />
        <Field
          id="discoveredOn"
          name="discoveredOn"
          type="date"
          label={t("discoveredOn")}
          defaultValue={submitted(state, "discoveredOn", today)}
          error={err("discoveredOn")}
        />
      </div>
      <TextareaField
        id="description"
        name="description"
        label={t("description")}
        rows={3}
        defaultValue={submitted(state, "description")}
      />
      <Field
        id="dataConcerned"
        name="dataConcerned"
        label={t("dataConcerned")}
        defaultValue={submitted(state, "dataConcerned")}
        error={err("dataConcerned")}
      />
      <Field
        id="peopleConcerned"
        name="peopleConcerned"
        label={t("peopleConcerned")}
        defaultValue={submitted(state, "peopleConcerned")}
        error={err("peopleConcerned")}
      />
      <SelectField
        id="severity"
        name="severity"
        label={t("severity")}
        defaultValue={submitted(state, "severity", "low")}
      >
        <option value="low">{t("severities.low")}</option>
        <option value="serious">{t("severities.serious")}</option>
      </SelectField>
      <TextareaField
        id="measures"
        name="measures"
        label={t("measures")}
        rows={2}
        defaultValue={submitted(state, "measures")}
      />
      <div>
        <Button type="submit" disabled={pending}>
          {t("recordIncident")}
        </Button>
      </div>
    </form>
  );
}

export function IncidentReportingForm({
  action,
  id,
  reportedToCaiOn,
  peopleNotifiedOn,
}: {
  action: Action;
  id: string;
  reportedToCaiOn: string | null;
  peopleNotifiedOn: string | null;
}) {
  const t = useTranslations("privacyAdmin");
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-end gap-3">
      <FormAlert state={state} />
      <Field
        id={`cai-${id}`}
        name="reportedToCaiOn"
        type="date"
        label={t("reportedToCaiOn")}
        defaultValue={reportedToCaiOn ?? ""}
      />
      <Field
        id={`people-${id}`}
        name="peopleNotifiedOn"
        type="date"
        label={t("peopleNotifiedOn")}
        defaultValue={peopleNotifiedOn ?? ""}
      />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {t("saveReporting")}
      </Button>
    </form>
  );
}
