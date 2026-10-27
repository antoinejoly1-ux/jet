"use client";

import { Camera, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { removeAvatarAction, setAvatarAction } from "@/app/actions/profile";
import { uploadFile } from "@/components/files/upload";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SIZE = 512;

/** Crops the middle square of a photo, zoomed, and resizes it to 512px WebP: about 40 KB instead of megabytes. */
async function squareWebp(file: File, zoom: number): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height) / zoom;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas
    .getContext("2d")!
    .drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/webp", 0.86),
  );
  return new File([blob], "avatar.webp", { type: "image/webp" });
}

/**
 * The profile photo: a large circle to drop or choose a photo into (the
 * camera roll or the camera on a phone), a zoom, then save.
 */
export function AvatarPicker({
  initialImage,
  initials,
  onSaved,
  size = "lg",
}: {
  initialImage: string | null;
  initials: string;
  onSaved?: (url: string | null) => void;
  size?: "md" | "lg";
}) {
  const t = useTranslations("avatar");
  const input = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState(initialImage);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const choose = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError(t("notAnImage"));
      return;
    }
    setError(null);
    setFile(f);
    setZoom(1);
    setPreview(URL.createObjectURL(f));
  };

  async function save() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await uploadFile(await squareWebp(file, zoom), "avatar");
      if (!result.ok) throw new Error("upload");
      const done = await setAvatarAction(result.fileId);
      if (done.status === "error") throw new Error("save");
      setSaved(preview);
      setFile(null);
      onSaved?.(preview);
    } catch {
      setError(t("failed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    await removeAvatarAction();
    setSaved(null);
    setPreview(null);
    setFile(null);
    setBusy(false);
    onSaved?.(null);
  }

  const shown = file ? preview : saved;
  const dim = size === "lg" ? "size-44 sm:size-52" : "size-28";

  return (
    <div className="flex flex-col items-center gap-5">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          choose(e.dataTransfer.files[0]);
        }}
        aria-label={shown ? t("change") : t("choose")}
        className={cn(
          "group border-border bg-surface-muted/40 relative flex items-center justify-center overflow-hidden rounded-full border transition-[border-color,transform] duration-300 hover:scale-[1.02]",
          dragging && "border-accent scale-[1.03]",
          dim,
        )}
      >
        {shown ? (
          // A local preview or our own small avatar: plain img is right here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shown}
            alt=""
            className="size-full object-cover transition-transform"
            style={file ? { transform: `scale(${zoom})` } : undefined}
          />
        ) : (
          <span className="text-muted flex flex-col items-center gap-2">
            <span className="text-4xl font-light tracking-wide">{initials}</span>
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-black/55 py-2.5 text-[11px] font-medium tracking-[0.12em] text-white uppercase opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Camera className="size-3.5" strokeWidth={1.5} aria-hidden />
          {shown ? t("change") : t("choose")}
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label={t("choose")}
        onChange={(e) => choose(e.target.files?.[0])}
      />

      {file ? (
        <div className="flex w-full max-w-xs flex-col items-center gap-4">
          <label className="text-muted flex w-full items-center gap-3 text-xs">
            {t("zoom")}
            <input
              type="range"
              min={1}
              max={2.5}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="accent-accent flex-1"
            />
          </label>
          <Button type="button" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {busy ? t("saving") : t("save")}
          </Button>
        </div>
      ) : saved ? (
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => input.current?.click()}>
            {t("change")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={busy}>
            <Trash2 aria-hidden />
            {t("remove")}
          </Button>
        </div>
      ) : (
        <p className="text-muted text-center text-sm">{t("hint")}</p>
      )}
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
