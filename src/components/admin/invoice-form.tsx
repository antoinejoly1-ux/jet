"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FileDrop, type DropStatus } from "@/components/files/file-drop";
import { uploadFile } from "@/components/files/upload";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import { SelectField } from "@/components/ui/select";
import { idle, submitted, type FormState } from "@/lib/forms";

export type ShareOption = { id: string; label: string };

/** Pulls an invoice number like INV-2026-0042 out of a file name, to save typing. */
const numberFromFilename = (name: string) =>
  name.match(/[A-Z]{2,5}[-_]?\d{2,4}[-_]?\d{1,6}/i)?.[0]?.toUpperCase() ?? "";

export function InvoiceForm({
  action,
  shares,
}: {
  action: (s: FormState, d: FormData) => Promise<FormState>;
  shares: ShareOption[];
}) {
  const t = useTranslations("invoices");
  const tf = useTranslations("formErrors");
  const [state, formAction, pending] = useActionState(action, idle);
  const [drop, setDrop] = useState<DropStatus>({ kind: "empty" });
  const [fileId, setFileId] = useState(submitted(state, "fileId"));
  const [number, setNumber] = useState(submitted(state, "number"));
  const err = (f: string) => (state.status === "error" && state.fields?.[f] ? tf(`fields.${f}`) : undefined);
  const today = new Date().toISOString().slice(0, 10);

  async function onFile(file: File) {
    setDrop({ kind: "uploading", name: file.name });
    const result = await uploadFile(file, "invoice");
    if (!result.ok) {
      const code = result.state.status === "error" ? result.state.code : undefined;
      setDrop({ kind: "error", message: tf.has(code ?? "") ? tf(code!) : tf("upload_failed") });
      return;
    }
    setFileId(result.fileId);
    setDrop({ kind: "done", name: file.name, duplicateOf: result.duplicateOf });
    if (!number) setNumber(numberFromFilename(file.name));
  }

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" noValidate>
      {/* The file comes first on a phone: dropping it can fill in the invoice number. */}
      <div className="lg:col-start-2 lg:row-start-1">
        <FileDrop
          accept="application/pdf,image/png,image/jpeg"
          label={t("pdf")}
          hint={t("pdfHint")}
          status={drop}
          onFile={onFile}
        />
      </div>
      <div className="flex flex-col gap-5 lg:col-start-1 lg:row-start-1">
        <FormAlert state={state} />
        <SelectField
          id="shareId"
          name="shareId"
          label={t("share")}
          defaultValue={submitted(state, "shareId")}
          error={err("shareId")}
        >
          <option value="" disabled>
            {t("chooseShare")}
          </option>
          {shares.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </SelectField>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="number"
            name="number"
            label={t("number")}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            error={err("number")}
            required
          />
          <Field
            id="total"
            name="total"
            inputMode="decimal"
            label={t("total")}
            hint={t("totalHint")}
            defaultValue={submitted(state, "total")}
            error={err("total")}
            required
          />
          <Field
            id="issuedOn"
            name="issuedOn"
            type="date"
            label={t("issuedOn")}
            defaultValue={submitted(state, "issuedOn", today)}
            error={err("issuedOn")}
          />
          <Field
            id="dueOn"
            name="dueOn"
            type="date"
            label={t("dueOn")}
            defaultValue={submitted(state, "dueOn")}
            error={err("dueOn")}
          />
          <SelectField
            id="currency"
            name="currency"
            label={t("currency")}
            defaultValue={submitted(state, "currency", "CAD")}
          >
            <option value="CAD">CAD</option>
            <option value="USD">USD</option>
          </SelectField>
        </div>
        <input type="hidden" name="fileId" value={fileId} />
        <div className="flex gap-2">
          <Button type="submit" disabled={pending || drop.kind === "uploading"}>
            {pending ? t("saving") : t("issue")}
          </Button>
          <Button asChild variant="ghost">
            <Link href="/admin/invoices">{t("cancel")}</Link>
          </Button>
        </div>
      </div>
    </form>
  );
}
