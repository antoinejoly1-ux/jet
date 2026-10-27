"use client";

import {
  BarChart3,
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  Gauge,
  Home,
  Inbox,
  Menu,
  MailPlus,
  Phone,
  Plus,
  MessageSquare,
  Plane,
  PlaneTakeoff,
  Settings,
  Upload,
  Users,
  Wallet,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { Route } from "next";
import { Icon, type IconMotion } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export type Side = "client" | "admin";
/** Unread counts shown next to destinations, by item key. */
export type Badges = Partial<Record<string, number>>;

function Count({ n, className }: { n: number | undefined; className?: string }) {
  const t = useTranslations("nav");
  if (!n) return null;
  return (
    <span
      className={cn(
        "bg-accent text-accent-foreground tabular inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] leading-5 font-semibold",
        className,
      )}
    >
      <span aria-hidden>{n > 99 ? "99+" : n}</span>
      <span className="sr-only">{t("unread", { count: n })}</span>
    </span>
  );
}

type Item = { href: Route; key: string; icon: LucideIcon; anim: IconMotion; mobile?: boolean };
type Group = { key: string | null; items: Item[] };

const CLIENT: Group[] = [
  {
    key: null,
    items: [
      { href: "/", key: "home", icon: Home, anim: "settle", mobile: true },
      { href: "/flights", key: "flights", icon: PlaneTakeoff, anim: "plane", mobile: true },
      { href: "/availability", key: "availability", icon: CalendarDays, anim: "flip", mobile: true },
      { href: "/finances", key: "finances", icon: Wallet, anim: "bounce", mobile: true },
      { href: "/invoices", key: "invoices", icon: FileText, anim: "slide" },
      { href: "/aircraft", key: "aircraft", icon: Plane, anim: "drop" },
      // Owners call or text more than they chat, so Messages stays out of the phone tabs.
      { href: "/messages", key: "messages", icon: MessageSquare, anim: "wiggle" },
    ],
  },
];

const ADMIN: Group[] = [
  {
    key: "operations",
    items: [
      { href: "/admin", key: "dashboard", icon: Gauge, anim: "pulse", mobile: true },
      { href: "/admin/aircraft", key: "aircraft", icon: Plane, anim: "drop" },
      { href: "/admin/flights", key: "flights", icon: PlaneTakeoff, anim: "plane", mobile: true },
      { href: "/admin/maintenance", key: "maintenance", icon: Wrench, anim: "twist" },
      { href: "/admin/messages", key: "messages", icon: Inbox, anim: "wiggle", mobile: true },
    ],
  },
  {
    key: "clients",
    items: [
      { href: "/admin/owners", key: "owners", icon: Users, anim: "bounce", mobile: true },
      { href: "/admin/holding-companies", key: "holdingCompanies", icon: Building2, anim: "settle" },
      { href: "/admin/invitations", key: "invitations", icon: MailPlus, anim: "slide" },
    ],
  },
  {
    key: "finance",
    items: [
      { href: "/admin/budgets", key: "budgets", icon: BarChart3, anim: "bounce" },
      { href: "/admin/transactions", key: "transactions", icon: ClipboardList, anim: "slide" },
      { href: "/admin/invoices", key: "invoices", icon: FileText, anim: "slide" },
      { href: "/admin/imports", key: "imports", icon: Upload, anim: "drop" },
    ],
  },
  { key: "settings", items: [{ href: "/admin/settings", key: "settings", icon: Settings, anim: "spin" }] },
];

/** The side's destinations, minus any the viewer has no access to (by item key). */
const groupsFor = (side: Side, hidden: readonly string[] = []) =>
  (side === "admin" ? ADMIN : CLIENT).map((g) => ({ ...g, items: g.items.filter((i) => !hidden.includes(i.key)) }));

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => (href === "/" || href === "/admin" ? pathname === href : pathname.startsWith(href));
}

/**
 * The desktop rail: 76px of icons, the current page in an ivory circle,
 * names as tooltips. Never wider, so the page keeps the room.
 */
export function Rail({ side, badges = {}, hidden }: { side: Side; badges?: Badges; hidden?: readonly string[] }) {
  const t = useTranslations("nav");
  const isActive = useIsActive();
  return (
    <nav aria-label={t("label")} className="flex flex-col items-center gap-3">
      {groupsFor(side, hidden).map((group, i) => (
        <div key={group.key ?? "main"} className="flex flex-col items-center gap-1.5">
          {i > 0 ? <div className="bg-border my-2 h-px w-6" aria-hidden /> : null}
          {group.items.map(({ href, key, icon, anim }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn(
                "group text-muted hover:text-text hover:bg-surface-muted relative flex size-11 items-center justify-center rounded-full transition-colors duration-300",
                "aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground",
              )}
            >
              <Icon icon={icon} anim={anim} className="size-[19px]" />
              {badges[key] ? (
                <span
                  className="bg-accent ring-background absolute top-2 right-2 size-2 rounded-full ring-2"
                  aria-hidden
                />
              ) : null}
              {/* The tooltip doubles as the link's name, so the name is the visible label (and unread counts join it). */}
              <span className="bg-primary text-primary-foreground shadow-float pointer-events-none absolute left-full z-50 ml-4 translate-x-1 rounded-full px-3.5 py-1.5 text-xs font-medium whitespace-nowrap opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100">
                {t(`items.${key}`)}
              </span>
              {badges[key] ? <span className="sr-only"> · {t("unread", { count: badges[key]! })}</span> : null}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

/** Every destination with its name, large, for the phone "More" menu. */
function MenuList({ side, badges = {}, hidden }: { side: Side; badges?: Badges; hidden?: readonly string[] }) {
  const t = useTranslations("nav");
  const isActive = useIsActive();
  return (
    <nav aria-label={t("label")} className="flex flex-col gap-6">
      {groupsFor(side, hidden).map((group) => (
        <div key={group.key ?? "main"}>
          {group.key ? <p className="eyebrow mb-2">{t(`groups.${group.key}`)}</p> : null}
          <ul className="divide-border divide-y">
            {group.items.map(({ href, key, icon, anim }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive(href) ? "page" : undefined}
                  className="group text-muted aria-[current=page]:text-text flex h-14 items-center gap-4 text-lg font-light"
                >
                  <Icon icon={icon} anim={anim} className="size-5" />
                  <span className="flex-1">{t(`items.${key}`)}</span>
                  <Count n={badges[key]} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** The round action button at the foot of the rail: call the team (owners) or plan a flight (staff). */
export type Fab = { kind: "call"; href: string } | { kind: "newFlight"; href: Route };

export function FloatingAction({ fab }: { fab: Fab }) {
  const t = useTranslations("nav");
  const label = fab.kind === "call" ? t("fabCall") : t("fabNewFlight");
  return (
    <a
      href={fab.href}
      aria-label={label}
      title={label}
      className="group bg-accent text-accent-foreground shadow-float relative flex size-12 items-center justify-center rounded-full transition-transform duration-300 hover:scale-105"
    >
      <Icon
        icon={fab.kind === "call" ? Phone : Plus}
        anim={fab.kind === "call" ? "shake" : "spin"}
        className="size-5"
      />
    </a>
  );
}

/**
 * Phone and tablet bottom tab bar: the four most used destinations plus
 * "More", which opens every destination full screen, with the team below.
 */
export function BottomTabs({
  side,
  badges = {},
  hidden,
  footer,
}: {
  side: Side;
  badges?: Badges;
  hidden?: readonly string[];
  /** Shown at the bottom of the "More" menu (the team and how to reach them). */
  footer?: React.ReactNode;
}) {
  const t = useTranslations("nav");
  const isActive = useIsActive();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const items = groupsFor(side, hidden)
    .flatMap((g) => g.items)
    .filter((i) => i.mobile)
    .slice(0, 4);

  // The menu closes on navigation and can't be scrolled behind.
  useEffect(() => {
    document.documentElement.style.overflow = moreOpen ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [moreOpen]);
  const [openedAt, setOpenedAt] = useState(pathname);
  if (moreOpen && openedAt !== pathname) {
    setMoreOpen(false);
    setOpenedAt(pathname);
  }

  const tab =
    "group flex h-16 w-full flex-col items-center justify-center gap-1 text-[10.5px] font-medium tracking-[0.02em] text-muted aria-[current=page]:text-text";
  const pill =
    "flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-300 group-aria-[current=page]:bg-primary group-aria-[current=page]:text-primary-foreground";
  return (
    <>
      {moreOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("more")}
          className="bg-background animate-rise fixed inset-0 z-40 flex flex-col overflow-y-auto px-6 pt-20 pb-28 lg:hidden"
        >
          <MenuList side={side} badges={badges} hidden={hidden} />
          {footer ? <div className="mt-10">{footer}</div> : null}
        </div>
      ) : null}
      <nav
        aria-label={t("label")}
        className="border-border bg-background/80 fixed inset-x-0 bottom-0 z-50 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))` }}>
          {items.map(({ href, key, icon, anim }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive(href) && !moreOpen ? "page" : undefined}
                className={cn(tab, "relative")}
              >
                <span className={pill}>
                  <Icon icon={icon} anim={anim} className="size-[19px]" />
                </span>
                <Count n={badges[key]} className="absolute top-1.5 left-1/2 ml-2" />
                <span className="max-w-full truncate px-1">
                  {t.has(`tabs.${key}`) ? t(`tabs.${key}`) : t(`items.${key}`)}
                </span>
              </Link>
            </li>
          ))}
          <li>
            <button
              type="button"
              aria-expanded={moreOpen}
              onClick={() => {
                setOpenedAt(pathname);
                setMoreOpen((o) => !o);
              }}
              className={tab}
              aria-current={moreOpen ? "page" : undefined}
            >
              <span className={pill}>
                {moreOpen ? (
                  <X className="size-[19px]" strokeWidth={1.5} aria-hidden />
                ) : (
                  <Menu className="size-[19px]" strokeWidth={1.5} aria-hidden />
                )}
              </span>
              <span>{t("more")}</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
