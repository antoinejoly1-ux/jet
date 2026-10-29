import type { LucideIcon } from "lucide-react";
import Image, { type StaticImageData } from "next/image";
import type { ReactNode } from "react";

/** Says what will appear here and when, instead of leaving a blank area. A photograph sets the mood when given. */
export function EmptyState({
  icon: Glyph,
  title,
  body,
  action,
  image,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
  image?: StaticImageData;
}) {
  return (
    <div className="group border-border bg-surface relative flex flex-col items-center overflow-hidden rounded-lg border px-6 py-16 text-center">
      {image ? (
        <>
          <Image src={image} alt="" fill sizes="(min-width: 1024px) 60vw, 100vw" className="object-cover opacity-25" />
          <div className="from-surface via-surface/80 to-surface/40 absolute inset-0 bg-gradient-to-t" aria-hidden />
        </>
      ) : null}
      <div className="relative flex flex-col items-center">
        <div className="border-border text-accent mb-5 flex size-14 items-center justify-center rounded-full border">
          <Glyph className="size-5" strokeWidth={1.75} aria-hidden />
        </div>
        <h2 className="text-xl font-light tracking-tight">{title}</h2>
        <p className="text-muted mt-2 max-w-sm text-sm leading-relaxed">{body}</p>
        {action ? <div className="mt-6">{action}</div> : null}
      </div>
    </div>
  );
}
