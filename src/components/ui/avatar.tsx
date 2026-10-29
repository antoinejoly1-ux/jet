import { cn } from "@/lib/utils";

/** "Marie-Laurence Boisvert" → "MB": the first and last words' initials. */
export const initials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return [words[0], words.length > 1 ? words.at(-1) : undefined].map((w) => w?.[0]?.toUpperCase() ?? "").join("");
};

/** A person's photo in a circle, or their initials when they haven't added one. */
export function Avatar({ name, image, className }: { name: string; image?: string | null; className?: string }) {
  return (
    <span
      className={cn(
        "bg-surface-muted text-text border-border flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border text-xs font-medium tracking-wide",
        className,
      )}
      aria-hidden
    >
      {image ? (
        // A small, already-sized avatar from our own route: next/image adds nothing here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="size-full object-cover" />
      ) : (
        initials(name) || "?"
      )}
    </span>
  );
}
