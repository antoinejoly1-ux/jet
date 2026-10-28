"use client";

import { CheckCircle2, Minus, Plus, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createContext, useActionState, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { requestFlightAction } from "@/app/actions/flight-requests";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import { SelectField } from "@/components/ui/select";
import { TextareaField } from "@/components/ui/textarea";
import { idle, submitted, type FormState } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { AirportField } from "./airport-field";

export type RequestableShare = {
  id: string;
  label: string;
  /** Where the aircraft is based, to start the departure there. */
  homeBase: string | null;
  homeBaseLabel: string;
};

type Open = (opts?: { date?: string }) => void;
const RequestFlightContext = createContext<Open | null>(null);

/** Opens the sheet from anywhere on the Client side; null when this person can't request (read-only, view-as). */
export const useRequestFlight = () => useContext(RequestFlightContext);

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * "Demander un vol": where, when, how many, in one sheet (a bottom sheet on
 * phones, a dialog on wider screens). It posts a structured message to
 * dispatch, who plan the flight from it and confirm.
 */
export function RequestFlightProvider({ shares, children }: { shares: RequestableShare[]; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [session, setSession] = useState<{ key: number; date?: string }>({ key: 0 });
  const open: Open = (opts) => {
    setSession((s) => ({ key: s.key + 1, date: opts?.date }));
    dialog.current?.showModal();
  };
  // Arriving with ?request=1 (from the welcome tour) opens the sheet right away.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("request") !== "1" || !shares.length) return;
    url.searchParams.delete("request");
    window.history.replaceState(null, "", url);
    dialog.current?.showModal();
  }, [shares.length]);
  return (
    <RequestFlightContext.Provider value={shares.length ? open : null}>
      {children}
      {shares.length ? (
        <dialog
          ref={dialog}
          aria-labelledby="request-flight-title"
          className="bg-surface text-text border-border fixed inset-x-0 top-auto bottom-0 m-0 max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-[28px] border p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm sm:inset-0 sm:m-auto sm:max-w-xl sm:rounded-[28px]"
          onClick={(e) => {
            // A click on the backdrop (the dialog itself, outside the panel) closes it.
            if (e.target === dialog.current) dialog.current?.close();
          }}
        >
          <RequestFlightForm
            key={session.key}
            shares={shares}
            initialDate={session.date}
            onClose={() => dialog.current?.close()}
          />
        </dialog>
      ) : null}
    </RequestFlightContext.Provider>
  );
}

function RequestFlightForm({
  shares,
  initialDate,
  onClose,
}: {
  shares: RequestableShare[];
  initialDate?: string;
  onClose: () => void;
}) {
  const t = useTranslations("requestFlight");
  const tf = useTranslations("formErrors");
  const [state, action, pending] = useActionState<FormState, FormData>(requestFlightAction, idle);
  const [shareId, setShareId] = useState(submitted(state, "shareId", shares[0]!.id));
  const [roundTrip, setRoundTrip] = useState(Boolean(submitted(state, "returnDate")));
  const [passengers, setPassengers] = useState(Number(submitted(state, "passengers", "2")) || 2);
  const share = shares.find((s) => s.id === shareId) ?? shares[0]!;
  const err = (f: string) => (state.status === "error" && state.fields?.[f] ? tf(`fields.${f}`) : undefined);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (state.status === "success") heading.current?.focus();
  }, [state.status]);

  if (state.status === "success")
    return (
      <div className="flex flex-col items-start gap-5 p-7 sm:p-9">
        <CheckCircle2 className="text-success size-10" strokeWidth={1.25} aria-hidden />
        <h2 ref={heading} tabIndex={-1} className="text-3xl font-light tracking-tight outline-none">
          {t("sentTitle")}
        </h2>
        <p className="text-muted leading-relaxed">{t("sentBody")}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onClose}>
            {t("close")}
          </Button>
          <Button asChild variant="secondary">
            <Link href="/messages" onClick={onClose}>
              {t("sentMessages")}
            </Link>
          </Button>
        </div>
      </div>
    );

  return (
    <form action={action} className="flex flex-col gap-5 p-6 sm:p-9" noValidate>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="request-flight-title" className="text-3xl font-light tracking-tight">
            {t("title")}
          </h2>
          <p className="text-muted mt-2 text-sm leading-relaxed">{t("body")}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="text-muted hover:text-text hover:bg-surface-muted -mt-1 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full"
        >
          <X className="size-5" strokeWidth={1.5} aria-hidden />
        </button>
      </div>
      <FormAlert state={state} />

      {shares.length > 1 ? (
        <SelectField
          id="rf-share"
          name="shareId"
          label={t("aircraft")}
          value={shareId}
          onChange={(e) => setShareId(e.target.value)}
        >
          {shares.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </SelectField>
      ) : (
        <input type="hidden" name="shareId" value={shareId} />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <AirportField
          key={share.id}
          name="from"
          label={t("from")}
          defaultValue={submitted(state, "from", share.homeBase)}
          defaultLabel={submitted(state, "from") ? "" : share.homeBaseLabel}
          error={err("from")}
          required
        />
        <AirportField
          name="to"
          label={t("to")}
          defaultValue={submitted(state, "to")}
          placeholder={t("toPlaceholder")}
          error={err("to")}
          required
        />
        <Field
          id="rf-date"
          name="date"
          type="date"
          label={t("date")}
          min={today()}
          defaultValue={submitted(state, "date", initialDate)}
          error={err("date")}
          required
        />
        <Field
          id="rf-time"
          name="time"
          type="time"
          step={900}
          label={t("time")}
          hint={t("timeHint")}
          defaultValue={submitted(state, "time")}
          error={err("time")}
        />
      </div>

      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={roundTrip}
          onChange={(e) => setRoundTrip(e.target.checked)}
          className="accent-accent size-5"
        />
        {t("returnTrip")}
      </label>
      {roundTrip ? (
        <Field
          id="rf-return"
          name="returnDate"
          type="date"
          label={t("returnDate")}
          min={today()}
          defaultValue={submitted(state, "returnDate")}
          error={err("returnDate")}
        />
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <span id="rf-pax-label" className="text-muted text-xs font-medium tracking-[0.04em]">
          {t("passengers")}
        </span>
        <div
          role="group"
          aria-labelledby="rf-pax-label"
          className="border-border flex items-center rounded-full border"
        >
          <button
            type="button"
            onClick={() => setPassengers((p) => Math.max(1, p - 1))}
            aria-label={t("fewer")}
            className="hover:bg-surface-muted flex size-11 items-center justify-center rounded-full"
          >
            <Minus className="size-4" aria-hidden />
          </button>
          <output aria-live="polite" className="tabular w-8 text-center text-lg font-light">
            {passengers}
          </output>
          <button
            type="button"
            onClick={() => setPassengers((p) => Math.min(19, p + 1))}
            aria-label={t("more")}
            className="hover:bg-surface-muted flex size-11 items-center justify-center rounded-full"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
        <input type="hidden" name="passengers" value={passengers} />
      </div>
      {err("passengers") ? <p className="text-danger -mt-3 text-xs">{err("passengers")}</p> : null}

      <TextareaField
        id="rf-notes"
        name="notes"
        label={t("notes")}
        placeholder={t("notesPlaceholder")}
        rows={3}
        defaultValue={submitted(state, "notes")}
      />

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={pending} className={cn(pending && "opacity-70")}>
          {pending ? t("sending") : t("send")}
        </Button>
      </div>
    </form>
  );
}

/** A button that opens the sheet; renders nothing for people who can't request. */
export function RequestFlightButton({
  date,
  children,
  variant = "primary",
  size,
  className,
}: {
  date?: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "accent" | "ghost" | "glass";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const open = useRequestFlight();
  if (!open) return null;
  return (
    <Button type="button" variant={variant} size={size} className={className} onClick={() => open({ date })}>
      {children}
    </Button>
  );
}
