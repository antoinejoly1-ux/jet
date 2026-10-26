"use client";

import { Paperclip, SendHorizontal, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useRef, useState } from "react";
import { uploadFile } from "@/components/files/upload";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { idle, submitted, type FormState } from "@/lib/forms";

/** Message box: Enter sends, Shift+Enter adds a line; a PDF or photo can ride along. */
export function Composer({
  action,
  placeholder,
}: {
  action: (s: FormState, d: FormData) => Promise<FormState>;
  placeholder: string;
}) {
  const t = useTranslations("messages");
  const tf = useTranslations("formErrors");
  const [file, setFile] = useState<{ id: string; name: string } | null>(null);
  const [state, formAction, pending] = useActionState(async (prev: FormState, data: FormData) => {
    const next = await action(prev, data);
    if (next.status === "success") setFile(null);
    return next;
  }, idle);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onPick(picked: File | undefined) {
    if (!picked) return;
    setUploading(true);
    setUploadError(null);
    const result = await uploadFile(picked, "message");
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    if (!result.ok) {
      const code = result.state.status === "error" ? result.state.code : undefined;
      setUploadError(tf.has(code ?? "") ? tf(code!) : tf("upload_failed"));
      return;
    }
    setFile({ id: result.fileId, name: picked.name });
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      <FormAlert state={state} />
      {uploadError ? <p className="text-danger text-sm font-medium">{uploadError}</p> : null}
      {file ? (
        <p className="bg-surface-muted inline-flex max-w-full items-center gap-2 self-start rounded-full py-1 pr-1 pl-3 text-sm">
          <Paperclip className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{file.name}</span>
          <button
            type="button"
            onClick={() => setFile(null)}
            className="hover:bg-surface inline-flex size-6 items-center justify-center rounded-full"
            aria-label={t("removeAttachment")}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </p>
      ) : null}
      <input type="hidden" name="attachmentFileId" value={file?.id ?? ""} />
      <div className="border-border bg-surface focus-within:ring-ring flex items-end gap-2 rounded-xl border p-2 focus-within:ring-2">
        <label className="hover:bg-surface-muted text-muted inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg">
          <Paperclip className="size-5" aria-hidden />
          <span className="sr-only">{t("attach")}</span>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            className="sr-only"
            onChange={(e) => onPick(e.target.files?.[0])}
          />
        </label>
        <label htmlFor="message-body" className="sr-only">
          {t("message")}
        </label>
        <textarea
          id="message-body"
          name="body"
          rows={1}
          placeholder={placeholder}
          defaultValue={submitted(state, "body")}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
          className="placeholder:text-muted [field-sizing:content] max-h-40 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-base outline-none sm:text-sm"
        />
        <Button type="submit" size="sm" disabled={pending || uploading} className="h-10 shrink-0">
          <SendHorizontal aria-hidden />
          <span className="sr-only sm:not-sr-only">{uploading ? t("uploading") : t("send")}</span>
        </Button>
      </div>
      <p className="text-muted hidden text-xs sm:block">{t("enterHint")}</p>
    </form>
  );
}
