import type { LucideIcon, LucideProps } from "lucide-react";

/** How an icon moves when its link, button or card (the nearest `.group`) is hovered or focused. */
export type IconMotion =
  "plane" | "ring" | "flip" | "bounce" | "drop" | "wiggle" | "spin" | "settle" | "slide" | "twist" | "shake" | "pulse";

/**
 * A lucide icon with a small hover animation. The motion is CSS only (see
 * globals.css), so it costs no JavaScript and stops under reduced motion.
 */
export function Icon({ icon: Glyph, anim, ...props }: LucideProps & { icon: LucideIcon; anim?: IconMotion }) {
  return <Glyph aria-hidden data-anim={anim} {...props} />;
}
