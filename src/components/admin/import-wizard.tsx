"use client";

import Papa from "papaparse";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { commitImportAction, previewImportAction, type PreviewResult } from "@/app/(admin)/admin/imports/actions";
import { FileDrop, type DropStatus } from "@/components/files/file-drop";
import { uploadFile } from "@/components/files/upload";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { SelectField } from "@/components/ui/select";
import type { FormState } from "@/lib/forms";
import { formatMoney } from "@/lib/format";
import { detectDateOrder, type DateOrder } from "@/lib/import-dates";

const FIELDS = ["date", "registration", "owner", "kind", "amount", "category", "description"] as const;
const REQUIRED = new Set(["date", "registration", "owner", "amount"]);
const MAX_ROWS = 5000;

/** Headers people commonly use for each field, French and English, to pre-select columns. */
const GUESSES: Record<(typeof FIELDS)[number], RegExp> = {
  date: /^(date|jour)/i,
  registration: /(immat|registration|appareil|aircraft|avion)/i,
  owner: /(propri|owner|client)/i,
  kind: /^(type|kind|nature)/i,
  amount: /(montant|amount|total|somme)/i,
  category: /(cat[ée]gorie|category|poste)/i,
  description: /(desc|note|libell|memo|détail)/i,
};

type Parsed = { headers: string[]; rows: Record<string, string>[]; fileId: string };

export function ImportWizard({ lastMapping, locale }: { lastMapping: Record<string, string> | null; locale: string }) {
  const t = useTranslations("imports");
  const tk = useTranslations("transactions.kinds");
  const tf = useTranslations("formErrors");
  const [drop, setDrop] = useState<DropStatus>({ kind: "empty" });
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Extract<PreviewResult, { ok: true }> | null>(null);
  const [problem, setProblem] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ imported: number; rejected: number } | null>(null);
  // Chosen by finance when the file's dates could be read either way (01/03/2026).
  const [dateOrder, setDateOrder] = useState<DateOrder | "">("");

  async function onFile(file: File) {
    setPreview(null);
    setDone(null);
    setProblem(null);
    setDateOrder("");
    setDrop({ kind: "uploading", name: file.name });
    const text = await file.text();
    const result = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
    });
    const headers = result.meta.fields?.filter(Boolean) ?? [];
    if (headers.length === 0 || result.data.length === 0) {
      setDrop({ kind: "error", message: t("emptyFile") });
      return;
    }
    if (result.data.length > MAX_ROWS) {
      setDrop({ kind: "error", message: t("tooManyRows", { max: MAX_ROWS }) });
      return;
    }
    const uploaded = await uploadFile(file, "import");
    if (!uploaded.ok) {
      const code = uploaded.state.status === "error" ? uploaded.state.code : undefined;
      setDrop({ kind: "error", message: tf.has(code ?? "") ? tf(code!) : tf("upload_failed") });
      return;
    }
    setDrop({
      kind: "done",
      name: t("rowsFound", { name: file.name, count: result.data.length }),
      duplicateOf: uploaded.duplicateOf,
    });
    setParsed({ headers, rows: result.data, fileId: uploaded.fileId });
    // Start from last time's choices where those columns exist, else guess from the header names.
    const initial: Record<string, string> = {};
    for (const f of FIELDS) {
      const previous = lastMapping?.[f];
      initial[f] = previous && headers.includes(previous) ? previous : (headers.find((h) => GUESSES[f].test(h)) ?? "");
    }
    setMapping(initial);
  }

  async function runPreview() {
    if (!parsed) return;
    setBusy(true);
    setProblem(null);
    const result = await previewImportAction(clean(mapping), parsed.rows, order ?? "dmy");
    setBusy(false);
    if (result.ok) setPreview(result);
    else setProblem(result.state);
  }

  async function commit() {
    if (!parsed) return;
    setBusy(true);
    const result = await commitImportAction(parsed.fileId, clean(mapping), parsed.rows, order ?? "dmy");
    setBusy(false);
    if (result.ok) {
      setDone(result);
      setParsed(null);
      setPreview(null);
      setDrop({ kind: "empty" });
    } else setProblem(result.state);
  }

  const missing = FIELDS.filter((f) => REQUIRED.has(f) && !mapping[f]);
  const detected = parsed && mapping.date ? detectDateOrder(parsed.rows.map((r) => r[mapping.date!] ?? "")) : null;
  // The order used: what the file shows, else what finance picked; null while still to choose.
  const order: DateOrder | null =
    detected === "dmy" || detected === "mdy" ? detected : detected === null ? "dmy" : dateOrder || null;

  return (
    <div className="flex flex-col gap-6">
      {done ? <Alert tone="success">{t("done", { imported: done.imported, rejected: done.rejected })}</Alert> : null}
      {problem ? <FormAlert state={problem} /> : null}

      <section aria-labelledby="step-file" className="flex flex-col gap-3">
        <h2 id="step-file" className="font-semibold">
          {t("step1")}
        </h2>
        <p className="text-muted text-sm">{t("step1Body")}</p>
        <FileDrop accept=".csv,text/csv" label={t("file")} hint={t("fileHint")} status={drop} onFile={onFile} />
      </section>

      {parsed ? (
        <section aria-labelledby="step-map" className="flex flex-col gap-3">
          <h2 id="step-map" className="font-semibold">
            {t("step2")}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FIELDS.map((f) => (
              <SelectField
                key={f}
                id={`map-${f}`}
                label={`${t(`fields.${f}`)}${REQUIRED.has(f) ? " *" : ""}`}
                value={mapping[f] ?? ""}
                onChange={(e) => {
                  setMapping((m) => ({ ...m, [f]: e.target.value }));
                  setPreview(null);
                }}
              >
                <option value="">{REQUIRED.has(f) ? t("chooseColumn") : t("notInFile")}</option>
                {parsed.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </SelectField>
            ))}
          </div>
          {detected === "ambiguous" ? (
            <fieldset className="border-warning/40 bg-warning/8 flex flex-col gap-2 rounded-lg border p-4">
              <legend className="px-1 text-sm font-medium">{t("dateOrderTitle")}</legend>
              <p className="text-muted text-sm">
                {t("dateOrderBody", { example: parsed.rows.find((r) => r[mapping.date!])?.[mapping.date!] ?? "" })}
              </p>
              {(["dmy", "mdy"] as const).map((o) => (
                <label key={o} className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="date-order"
                    value={o}
                    checked={dateOrder === o}
                    onChange={() => {
                      setDateOrder(o);
                      setPreview(null);
                    }}
                  />
                  {t(`dateOrders.${o}`)}
                </label>
              ))}
            </fieldset>
          ) : null}
          <Button
            type="button"
            onClick={runPreview}
            disabled={busy || missing.length > 0 || order === null}
            className="self-start"
          >
            {t("check")}
          </Button>
        </section>
      ) : null}

      {preview ? (
        <section aria-labelledby="step-check" className="flex flex-col gap-3">
          <h2 id="step-check" className="font-semibold">
            {t("step3")}
          </h2>
          <p className="text-sm">{t("summary", { valid: preview.valid, total: preview.total })}</p>
          {preview.sample.length > 0 ? (
            <div className="border-border overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <caption className="text-muted px-3 py-2 text-left text-xs">
                  {t("sampleCaption", { count: preview.sample.length })}
                </caption>
                <thead className="bg-surface-muted text-muted text-xs font-semibold">
                  <tr>
                    {(
                      ["row", "date", "registration", "owner", "kind", "amount", "category", "description"] as const
                    ).map((h) => (
                      <th key={h} scope="col" className={`px-3 py-2 ${h === "amount" ? "text-right" : "text-left"}`}>
                        {h === "row" ? t("row") : t(`fields.${h}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-border bg-surface divide-y">
                  {preview.sample.map((r) => (
                    <tr key={r.row}>
                      <td className="tabular text-muted px-3 py-2">{r.row}</td>
                      <td className="tabular px-3 py-2 whitespace-nowrap">{r.occurredOn}</td>
                      <td className="px-3 py-2">{r.registration}</td>
                      <td className="px-3 py-2">{r.ownerName}</td>
                      <td className="px-3 py-2">{tk(r.kind)}</td>
                      <td className="tabular px-3 py-2 text-right whitespace-nowrap">
                        {formatMoney(r.amountCents, "CAD", locale)}
                      </td>
                      <td className="text-muted px-3 py-2">{r.category ?? "—"}</td>
                      <td className="text-muted max-w-48 truncate px-3 py-2">{r.description ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {preview.errors.length > 0 ? (
            <div className="border-border max-h-80 overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted text-muted sticky top-0 text-xs font-semibold">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left">
                      {t("row")}
                    </th>
                    <th scope="col" className="px-3 py-2 text-left">
                      {t("column")}
                    </th>
                    <th scope="col" className="px-3 py-2 text-left">
                      {t("problem")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-border bg-surface divide-y">
                  {preview.errors.map((e, i) => (
                    <tr key={i}>
                      <td className="tabular px-3 py-2">{e.row}</td>
                      <td className="px-3 py-2">{t(`fields.${e.field}`)}</td>
                      <td className="text-danger px-3 py-2">{t(`errors.${e.code}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <Button type="button" onClick={commit} disabled={busy || preview.valid === 0} className="self-start">
            {t("commit", { count: preview.valid })}
          </Button>
        </section>
      ) : null}
    </div>
  );
}

const clean = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).filter(([, v]) => v));
