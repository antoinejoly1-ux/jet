import Link from "next/link";
import { AnimatedIcon } from "@/components/animated-icons/AnimatedIcon";
import { getTranslations } from "next-intl/server";
import type { Side } from "./nav";

export async function NotificationBell({ side, unread }: { side: Side; unread: number }) {
  const t = await getTranslations("notifications");
  return (
    <Link
      href={side === "admin" ? "/admin/notifications" : "/notifications"}
      className="ai-trigger border-border hover:bg-surface-muted relative inline-flex size-11 items-center justify-center rounded-full border"
      aria-label={unread ? t("bellUnread", { count: unread }) : t("title")}
    >
      <AnimatedIcon name="bell" size={19} />
      {unread ? (
        <span
          aria-hidden
          className="bg-accent text-accent-foreground tabular absolute -top-0.5 -right-0.5 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-semibold"
        >
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
