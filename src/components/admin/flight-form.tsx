"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import { SelectField } from "@/components/ui/select";
import { idle, submitted, type FormState } from "@/lib/forms";

export type AircraftOption = { id: string; label: string };
export type FlightShareOption = { id: string; aircraftId: string; label: string };
export type FlightDefaults = {
  aircraftId: string;
  shareId: string;
  fromAirport: string;
  toAirport: string;
  departsAt: string;
  arrivesAt: string;
};

export function FlightForm({
  action,
  aircraft,
  shares,
  defaults,
}: {
  action: (s: FormState, d: FormData) => Promise<FormState>;
  aircraft: AircraftOption[];
  shares: FlightShareOption[];
  defaults?: FlightDefaults;
}) {
  const t = useTranslations("flights");
  const tf = useTranslations("formErrors");
  const [state, formAction, pending] = useActionState(action, idle);
  const [aircraftId, setAircraftId] = useState(submitted(state, "aircraftId", defaults?.aircraftId));
  const err = (f: string) => (state.status === "error" && state.fields?.[f] ? tf(`fields.${f}`) : undefined);
  const planeShares = shares.filter((s) => s.aircraftId === aircraftId);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5" noValidate>
      <FormAlert state={state} />
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          id="aircraftId"
          name="aircraftId"
          label={t("aircraft")}
          defaultValue={aircraftId}
          onChange={(e) => setAircraftId(e.target.value)}
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
        {/* Keyed on the aircraft so switching planes resets the owner choice. */}
        <SelectField
          key={aircraftId}
          id="shareId"
          name="shareId"
          label={t("share")}
          defaultValue={submitted(state, "shareId", defaults?.shareId)}
          error={err("shareId")}
          disabled={!aircraftId}
        >
          <option value="">{t("noShare")}</option>
          {planeShares.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </SelectField>
        <Field
          id="fromAirport"
          name="fromAirport"
          label={t("from")}
          hint={t("airportHint")}
          autoCapitalize="characters"
          defaultValue={submitted(state, "fromAirport", defaults?.fromAirport)}
          error={err("fromAirport")}
          required
        />
        <Field
          id="toAirport"
          name="toAirport"
          label={t("to")}
          autoCapitalize="characters"
          defaultValue={submitted(state, "toAirport", defaults?.toAirport)}
          error={err("toAirport")}
          required
        />
        <Field
          id="departsAt"
          name="departsAt"
          type="datetime-local"
          label={t("departsAt")}
          hint={t("localTimeHint")}
          defaultValue={submitted(state, "departsAt", defaults?.departsAt)}
          error={err("departsAt")}
          required
        />
        <Field
          id="arrivesAt"
          name="arrivesAt"
          type="datetime-local"
          label={t("arrivesAt")}
          defaultValue={submitted(state, "arrivesAt", defaults?.arrivesAt)}
          error={err("arrivesAt")}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/admin/flights">{t("cancel")}</Link>
        </Button>
      </div>
    </form>
  );
}
