import { ICONS, type AnimatedIconName } from "./icons";

// React wrapper. Usage: <button className="ai-trigger"><AnimatedIcon name="chat" /> Chat</button>
// The markup comes from icons.ts (static strings), so innerHTML is safe here. Plain SVG: works in
// server components with no "use client".
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
      className={`ai ai-${name} ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      dangerouslySetInnerHTML={{ __html: ICONS[name] ?? "" }}
    />
  );
}

export { ANIMATED_ICON_NAMES, type AnimatedIconName } from "./icons";
