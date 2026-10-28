import { Avatar } from "./avatar";
import { cn } from "@/lib/utils";

/** A name with a small round photo (or initials) before it, to sit inline in a line of text. */
export function Person({ name, image, className }: { name: string; image?: string | null; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 align-middle", className)}>
      <PersonAvatar name={name} image={image} />
      {name}
    </span>
  );
}

/** The 20px avatar used next to a name in running text. */
export function PersonAvatar({ name, image }: { name: string; image?: string | null }) {
  return <Avatar name={name} image={image} className="size-5 text-[9px] tracking-normal" />;
}
