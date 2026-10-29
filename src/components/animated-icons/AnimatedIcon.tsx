import { ICONS, type AnimatedIconName } from "./icons";

// One icon: its strokes as separate paths, each with pathLength=1 so the stylesheet can redraw
// them in turn when the link or button around it is hovered, plus the icon's own small gesture.
// Plain SVG, so it works in server components.
export function AnimatedIcon({
  name,
  size = 24,
  className = "",
  title,
}: {
  name: AnimatedIconName;
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      className={`ic ic--${name} ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {ICONS[name].map((d, i) => (
        <path key={i} d={d} pathLength={1} className={`p${i}`} />
      ))}
    </svg>
  );
}

export { ANIMATED_ICON_NAMES, type AnimatedIconName } from "./icons";
