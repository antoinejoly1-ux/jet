import type { LucideIcon, LucideProps } from "lucide-react";

/**
 * Kept so call sites read as before: every icon now draws itself the same way
 * when its link, button or card (the nearest `.group`) is hovered or focused.
 */
export type IconMotion =
  "plane" | "ring" | "flip" | "bounce" | "drop" | "wiggle" | "spin" | "settle" | "slide" | "twist" | "shake" | "pulse";

/**
 * A lucide icon whose strokes trace themselves on hover. The drawing is CSS
 * only (see globals.css), so it costs no JavaScript and stops under reduced motion.
 */
export function Icon({ icon: Glyph, anim, ...props }: LucideProps & { icon: LucideIcon; anim?: IconMotion }) {
  return <Glyph aria-hidden data-anim={anim ?? "draw"} strokeWidth={1.5} {...props} />;
}
