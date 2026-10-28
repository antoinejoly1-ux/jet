"use client";

import { Camera, Check, Loader2, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useId, useState } from "react";
import { submitReportAction } from "@/app/pilot/actions";
import { uploadFile } from "@/components/files/upload";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import { Select } from "@/components/ui/select";
import { TextareaField } from "@/components/ui/textarea";
import { formatHours } from "@/lib/format";
import { idle, submitted, type FormState } from "@/lib/forms";
import { parseDurationToMinutes } from "@/lib/validation/operations";
import { cn } from "@/lib/utils";

const CATEGORIES = ["fuel", "handling", "airport_fees", "hotel", "per_diem", "catering", "other"] as const;

export type ExpenseRow = {
  key: string;
  category: (typeof CATEGORIES)[number];
  amount: string;
  /** Receipts abroad are in US dollars; finance converts them when approving. */
  currency: "CAD" | "USD";
  paidBy: "pilot" | "company_card";
  receiptFileId: string;
  note: string;
};

/** Receipts are photos: 2000px JPEG keeps them legible at a fraction of the camera's size, and turns HEIC into JPEG. */
async function shrinkPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.85),
    );
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

let seq = 0;
const blank = (): ExpenseRow => ({
  key: `new-${++seq}`,
  category: "fuel",
  amount: "",
  currency: "CAD",
  paidBy: "company_card",
  receiptFileId: "",
  note: "",
});

/**
 * The flight report, made for a phone: time flown, fuel, then each expense
 * with a photo of its receipt. Sending it closes the flight.
 */
export function ReportForm({
  flightId,
  initial,
}: {
  flightId: string;
  initial: { flightTime: string; fuelLitres: string; notes: string; expenses: ExpenseRow[] };
}) {
  const t = useTranslations("pilot.form");
  const tf = useTranslations("formErrors");
  const locale = useLocale();
  const [state, action, pending] = useActionState<FormState, FormData>(submitReportAction, idle);
  // Echo the time as read, so "1.35" (1 h 21) isn't taken for 1 h 35 without the pilot seeing it.
  const [flightTime, setFlightTime] = useState(submitted(state, "flightTime", initial.flightTime));
  const minutes = flightTime.trim() ? parseDurationToMinutes(flightTime) : null;
  // Rows are state, not form fields, so a refused send keeps everything typed.
  const [rows, setRows] = useState<ExpenseRow[]>(initial.expenses);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const err = (f: string) => (state.status === "error" && state.fields?.[f] ? tf(`fields.${f}`) : undefined);
  const update = (key: string, patch: Partial<ExpenseRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const attach = async (key: string, file: File | undefined) => {
    if (!file) return;
    setUploading(key);
    setUploadError(null);
    const result = await uploadFile(await shrinkPhoto(file), "receipt");
    setUploading(null);
    if (result.ok) update(key, { receiptFileId: result.fileId });
    else setUploadError(key);
  };

  const payload = JSON.stringify(rows.map(({ key: _key, ...r }) => r));

  return (
    <form action={action} className="flex flex-col gap-8" noValidate>
      <input type="hidden" name="flightId" value={flightId} />
      <input type="hidden" name="expenses" value={payload} />
      <FormAlert state={state} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Field
            id="flightTime"
            name="flightTime"
            label={t("flightTime")}
            hint={t("flightTimeHint")}
            inputMode="decimal"
            autoComplete="off"
            value={flightTime}
            onChange={(e) => setFlightTime(e.target.value)}
            error={err("flightTime")}
            required
          />
          <p id="flightTime-echo" aria-live="polite" className="text-sm font-medium">
            {minutes && minutes <= 24 * 60 ? t("flightTimeEcho", { time: formatHours(minutes, locale) }) : ""}
          </p>
        </div>
        <Field
          id="fuelLitres"
          name="fuelLitres"
          label={t("fuelLitres")}
          inputMode="numeric"
          defaultValue={submitted(state, "fuelLitres", initial.fuelLitres)}
          error={err("fuelLitres")}
        />
      </div>

      <section aria-labelledby="expenses-title" className="flex flex-col gap-3">
        <div>
          <h2 id="expenses-title" className="text-xl font-light tracking-tight">
            {t("expenses")}
          </h2>
          <p className="text-muted mt-1 text-sm">{t("expensesBody")}</p>
        </div>
        {err("expenses") ? <p className="text-danger text-xs font-medium">{err("expenses")}</p> : null}
        <ul className="flex flex-col gap-3">
          {rows.map((row, i) => (
            <ExpenseItem
              key={row.key}
              row={row}
              index={i}
              uploading={uploading === row.key}
              uploadFailed={uploadError === row.key}
              onChange={(patch) => update(row.key, patch)}
              onRemove={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
              onPhoto={(file) => attach(row.key, file)}
            />
          ))}
        </ul>
        <div>
          <Button type="button" variant="secondary" onClick={() => setRows((rs) => [...rs, blank()])}>
            <Plus aria-hidden />
            {t("addExpense")}
          </Button>
        </div>
      </section>

      <TextareaField
        id="notes"
        name="notes"
        label={t("notes")}
        placeholder={t("notesPlaceholder")}
        rows={3}
        defaultValue={submitted(state, "notes", initial.notes)}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          type="submit"
          size="lg"
          disabled={pending || uploading !== null}
          className={cn(pending && "opacity-70")}
        >
          {pending ? t("sending") : t("send")}
        </Button>
      </div>
    </form>
  );
}

function ExpenseItem({
  row,
  index,
  uploading,
  uploadFailed,
  onChange,
  onRemove,
  onPhoto,
}: {
  row: ExpenseRow;
  index: number;
  uploading: boolean;
  uploadFailed: boolean;
  onChange: (patch: Partial<ExpenseRow>) => void;
  onRemove: () => void;
  onPhoto: (file: File | undefined) => void;
}) {
  const t = useTranslations("pilot.form");
  const id = useId();
  return (
    <li className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">{t("expenseN", { n: index + 1 })}</p>
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("removeExpense", { n: index + 1 })}
          className="text-muted hover:text-danger hover:bg-surface-muted -m-2 flex size-11 items-center justify-center rounded-full"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-cat`} className="text-muted text-xs font-medium tracking-[0.04em]">
            {t("category")}
          </label>
          <Select
            id={`${id}-cat`}
            value={row.category}
            onChange={(e) => onChange({ category: e.target.value as ExpenseRow["category"] })}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`categories.${c}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Field
              id={`${id}-amount`}
              label={t("amount")}
              inputMode="decimal"
              placeholder="0,00"
              value={row.amount}
              onChange={(e) => onChange({ amount: e.target.value })}
            />
          </div>
          <div
            role="radiogroup"
            aria-label={t("currency")}
            className="border-border bg-surface-muted inline-flex h-11 shrink-0 rounded-md border p-0.5"
          >
            {(["CAD", "USD"] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={row.currency === c}
                onClick={() => onChange({ currency: c })}
                className={cn(
                  "text-muted min-w-12 rounded-[5px] px-2.5 text-sm font-semibold",
                  row.currency === c && "bg-surface text-text shadow-sm",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-paid`} className="text-muted text-xs font-medium tracking-[0.04em]">
            {t("paidBy")}
          </label>
          <Select
            id={`${id}-paid`}
            value={row.paidBy}
            onChange={(e) => onChange({ paidBy: e.target.value as ExpenseRow["paidBy"] })}
          >
            <option value="company_card">{t("payers.company_card")}</option>
            <option value="pilot">{t("payers.pilot")}</option>
          </Select>
        </div>
        <Field
          id={`${id}-note`}
          label={t("expenseNote")}
          value={row.note}
          onChange={(e) => onChange({ note: e.target.value })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label
          className={cn(
            "border-border hover:bg-surface-muted inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium",
            "has-[:focus-visible]:ring-accent/60 has-[:focus-visible]:ring-2",
            row.receiptFileId && "border-success/40 text-success",
          )}
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : row.receiptFileId ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <Camera className="size-4" aria-hidden />
          )}
          {uploading ? t("uploading") : row.receiptFileId ? t("receiptAttached") : t("addReceipt")}
          <input
            type="file"
            accept="image/*,application/pdf"
            className="sr-only"
            onChange={(e) => onPhoto(e.target.files?.[0])}
          />
        </label>
        {row.receiptFileId ? (
          <a
            href={`/files/${row.receiptFileId}?inline=1`}
            target="_blank"
            rel="noreferrer"
            className="text-accent text-sm underline-offset-4 hover:underline"
          >
            {t("viewReceipt")}
          </a>
        ) : null}
        {uploadFailed ? <p className="text-danger text-xs font-medium">{t("uploadFailed")}</p> : null}
      </div>
    </li>
  );
}
