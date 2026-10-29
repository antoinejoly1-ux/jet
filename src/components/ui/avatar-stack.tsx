import { cn } from "@/lib/utils";
import { initials } from "./avatar";

/** Overlapping faces (photo or initials), up to `max`, then « +2 ». */
export function AvatarStack({
  people,
  max = 4,
  size = "md",
  label,
}: {
  people: { id: string; name: string; image: string | null }[];
  max?: number;
  size?: "sm" | "md";
  /** What the group is, for screen readers ("Propriétaires : …"). */
  label: string;
}) {
  const shown = people.slice(0, max);
  const more = people.length - shown.length;
  const box = size === "sm" ? "size-7 text-[10px]" : "size-9 text-xs";
  return (
    <ul className="flex items-center" aria-label={`${label} : ${people.map((p) => p.name).join(", ")}`}>
      {shown.map((p) => (
        <li
          key={p.id}
          title={p.name}
          aria-hidden
          className={cn(
            "bg-surface-muted ring-surface -ml-2 flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ring-2 first:ml-0",
            box,
          )}
        >
          {p.image ? (
            // The person's own photo (data URL or signed link): next/image adds nothing here.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.image} alt="" className="size-full object-cover" />
          ) : (
            initials(p.name)
          )}
        </li>
      ))}
      {more > 0 ? (
        <li
          aria-hidden
          className={cn(
            "bg-surface-muted text-muted ring-surface -ml-2 flex shrink-0 items-center justify-center rounded-full font-semibold ring-2",
            box,
          )}
        >
          +{more}
        </li>
      ) : null}
    </ul>
  );
}
