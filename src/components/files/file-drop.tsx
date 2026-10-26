"use client";

import { CheckCircle2, FileUp, Loader2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type DragEvent } from "react";
import { cn } from "@/lib/utils";

export type DropStatus =
  | { kind: "empty" }
  | { kind: "uploading"; name: string }
  | { kind: "done"; name: string; duplicateOf: string | null }
  | { kind: "error"; message: string };

/** A drop zone that is also a normal file input, so keyboard and screen-reader users can pick a file. */
export function FileDrop({
  accept,
  label,
  hint,
  status,
  onFile,
}: {
  accept: string;
  label: string;
  hint: string;
  status: DropStatus;
  onFile: (file: File) => void;
}) {
  const t = useTranslations("files");
  const id = useId();
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        className={cn(
          "border-border bg-surface flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
          "focus-within:border-ring hover:bg-surface-muted",
          over && "border-accent bg-accent/5",
        )}
      >
        {status.kind === "uploading" ? (
          <>
            <Loader2 className="text-muted size-6 animate-spin" aria-hidden />
            <span className="text-sm">{t("uploading", { name: status.name })}</span>
          </>
        ) : status.kind === "done" ? (
          <>
            <CheckCircle2 className="text-success size-6" aria-hidden />
            <span className="text-sm font-medium">{status.name}</span>
            <span className="text-muted text-xs">{t("replace")}</span>
          </>
        ) : (
          <>
            <FileUp className="text-muted size-6" aria-hidden />
            <span className="text-sm font-medium">{t("dropOrPick")}</span>
            <span className="text-muted text-xs">{hint}</span>
          </>
        )}
        <input
          id={id}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
      </label>
      <div aria-live="polite">
        {status.kind === "error" ? (
          <p className="text-danger text-xs font-medium">{status.message}</p>
        ) : status.kind === "done" && status.duplicateOf ? (
          <p className="text-warning flex items-center gap-1 text-xs font-medium">
            <TriangleAlert className="size-3.5" aria-hidden />
            {t("duplicate", { name: status.duplicateOf })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
