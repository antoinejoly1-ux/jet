"use client";

import { Camera, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { uploadFile } from "@/components/files/upload";
import { cn } from "@/lib/utils";

/** 1600px WebP: sharp on a wide screen, a fraction of a camera file. */
async function resize(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/webp", 0.85),
    );
    return new File([blob], "aircraft.webp", { type: "image/webp" });
  } catch {
    return file;
  }
}

/** Choose or replace an aircraft's photo; it shows everywhere the aircraft does. */
export function AircraftPhotoPicker({
  save,
  className,
}: {
  save: (fileId: string) => Promise<{ status: string }>;
  className?: string;
}) {
  const t = useTranslations("fleet");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className={cn("flex flex-col items-end gap-1", className)}>
      <label
        className={cn(
          "bg-surface/90 text-text hover:bg-surface inline-flex h-10 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-medium shadow-sm backdrop-blur",
          "has-[:focus-visible]:ring-accent/60 has-[:focus-visible]:ring-2",
        )}
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Camera className="size-4" aria-hidden />}
        {busy ? t("photoUploading") : t("changePhoto")}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            setFailed(false);
            const result = await uploadFile(await resize(file), "photo");
            const saved = result.ok ? await save(result.fileId) : null;
            setBusy(false);
            if (saved?.status === "success") router.refresh();
            else setFailed(true);
          }}
        />
      </label>
      {failed ? <p className="bg-surface text-danger rounded px-2 text-xs font-medium">{t("photoFailed")}</p> : null}
    </div>
  );
}
