"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { AirportField } from "@/components/flights/airport-field";
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
  requestId,
  allowReturn = false,
}: {
  action: (s: FormState, d: FormData) => Promise<FormState>;
  aircraft: AircraftOption[];
  shares: FlightShareOption[];
  defaults?: FlightDefaults;
  /** Planning an owner's request: saving closes it and tells the owner. */
  requestId?: string;
  /** New flights offer "Enregistrer et planifier le retour". */
  allowReturn?: boolean;
}) {
  const t = useTranslations("flights");
  const tf = useTranslations("formErrors");
  const [state, formAction, pending] = useActionState(action, idle);
  const [aircraftId, setAircraftId] = useState(submitted(state, "aircraftId", defaults?.aircraftId));
  // A field's error goes away as soon as it's changed; a new submit brings back whatever still fails.
  const [cleared, setCleared] = useState<{ for: FormState; fields: string[] }>({ for: state, fields: [] });
  const fixed = cleared.for === state ? cleared.fields : [];
  const err = (f: string) =>
    state.status === "error" && state.fields?.[f] && !fixed.includes(f) ? tf(`fields.${f}`) : undefined;
  const planeShares = shares.filter((s) => s.aircraftId === aircraftId);
  // Who pays: the saved choice for this aircraft, the only share, convoyage when the aircraft has no
  // shares, else nothing until someone picks (« Choisir qui paie les heures »).
  const shareDefault =
    defaults?.shareId && aircraftId === defaults.aircraftId
      ? defaults.shareId
      : planeShares.length === 1
        ? planeShares[0]!.id
        : aircraftId && planeShares.length === 0
          ? "none"
          : "";

  return (
    <form
      action={formAction}
      className="flex max-w-2xl flex-col gap-5"
      noValidate
      onChange={(e) => {
        const target = e.target as unknown as HTMLInputElement;
        // Airport pickers type into an unnamed box: their wrapper says which field it is.
        const name = target.name || target.closest<HTMLElement>("[data-field]")?.dataset.field;
        if (name && !fixed.includes(name)) setCleared({ for: state, fields: [...fixed, name] });
      }}
    >
      <FormAlert state={state} />
      {requestId ? <input type="hidden" name="requestId" value={requestId} /> : null}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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
          defaultValue={submitted(state, "shareId", shareDefault)}
          error={err("shareId")}
          disabled={!aircraftId}
          required
        >
          <option value="" disabled>
            {t("chooseShare")}
          </option>
          <option value="none">{t("noShare")}</option>
          {planeShares.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </SelectField>
        <div data-field="fromAirport">
          <AirportField
            name="fromAirport"
            label={t("from")}
            defaultValue={submitted(state, "fromAirport", defaults?.fromAirport)}
            error={err("fromAirport")}
            required
          />
        </div>
        <div data-field="toAirport">
          <AirportField
            name="toAirport"
            label={t("to")}
            defaultValue={submitted(state, "toAirport", defaults?.toAirport)}
            error={err("toAirport")}
            required
          />
        </div>
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
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
        {/* Most trips come back: save this leg and open the return, reversed and ready. */}
        {allowReturn ? (
          <Button type="submit" name="then" value="return" variant="secondary" disabled={pending}>
            {t("saveAndReturn")}
          </Button>
        ) : null}
        <Button asChild variant="ghost">
          <Link href="/admin/flights">{t("cancel")}</Link>
        </Button>
      </div>
    </form>
  );
}
