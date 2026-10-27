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
import { useState } from "react";
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
        "bg-accent text-primary-foreground tabular inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] leading-5 font-semibold",
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
 * Desktop navigation. From 1024px it is a slim rail of icons with tooltips;
 * from 1280px the labels and group names show beside them.
 */
export function Sidebar({
  side,
  badges = {},
  hidden,
  expanded = false,
}: {
  side: Side;
  badges?: Badges;
  hidden?: readonly string[];
  /** Always show labels (the phone "More" sheet). */
  expanded?: boolean;
}) {
  const t = useTranslations("nav");
  const isActive = useIsActive();
  const show = (cls: string) => (expanded ? "" : cls);
  return (
    <nav aria-label={t("label")} className="flex flex-col gap-4">
      {groupsFor(side, hidden).map((group, i) => (
        <div key={group.key ?? "main"}>
          {i > 0 && !expanded ? <div className="bg-border mx-auto mb-4 h-px w-8 xl:hidden" aria-hidden /> : null}
          {group.key ? (
            <p className={cn("eyebrow mb-2 px-3", show("hidden xl:block"))}>{t(`groups.${group.key}`)}</p>
          ) : null}
          <ul className="flex flex-col gap-1">
            {group.items.map(({ href, key, icon, anim }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive(href) ? "page" : undefined}
                  className={cn(
                    "group text-muted hover:text-text relative flex h-11 items-center gap-3 rounded-full px-3.5 text-sm font-medium transition-colors",
                    "hover:bg-surface-muted aria-[current=page]:bg-surface aria-[current=page]:text-text aria-[current=page]:shadow-card",
                    show("justify-center xl:justify-start"),
                  )}
                >
                  <Icon icon={icon} anim={anim} className="size-[18px] shrink-0" />
                  <span className={cn("flex-1 truncate", show("sr-only xl:not-sr-only"))}>{t(`items.${key}`)}</span>
                  <Count
                    n={badges[key]}
                    className={show(
                      "absolute top-1 right-1 min-w-4 px-1 text-[10px] leading-4 xl:static xl:min-w-5 xl:px-1.5 xl:text-[11px] xl:leading-5",
                    )}
                  />
                  {/* Tooltip for the icon-only rail. */}
                  {expanded ? null : (
                    <span
                      aria-hidden
                      className="bg-primary text-primary-foreground shadow-float pointer-events-none absolute left-full z-50 ml-3 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 xl:hidden"
                    >
                      {t(`items.${key}`)}
                    </span>
                  )}
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
      className="group bg-primary text-primary-foreground shadow-float relative flex size-12 items-center justify-center rounded-full transition-transform duration-300 hover:scale-105 xl:w-full xl:gap-2 xl:px-5"
    >
      <Icon
        icon={fab.kind === "call" ? Phone : Plus}
        anim={fab.kind === "call" ? "shake" : "spin"}
        className="size-5"
      />
      <span className="hidden text-sm font-semibold xl:inline">{label}</span>
    </a>
  );
}

/**
 * Phone and tablet bottom tab bar: the four most used destinations of the
 * current side, plus "More", which opens every destination in a sheet.
 * The active tab's icon sits in a pill.
 */
export function BottomTabs({ side, badges = {}, hidden }: { side: Side; badges?: Badges; hidden?: readonly string[] }) {
  const t = useTranslations("nav");
  const isActive = useIsActive();
  const [moreOpen, setMoreOpen] = useState(false);
  const items = groupsFor(side, hidden)
    .flatMap((g) => g.items)
    .filter((i) => i.mobile)
    .slice(0, 4);

  const tab =
    "group flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted aria-[current=page]:text-text";
  const pill =
    "flex h-8 w-14 items-center justify-center rounded-full transition-colors group-aria-[current=page]:bg-surface-muted";
  return (
    <>
      {moreOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("more")}
          // Close the sheet once a destination is picked.
          onClick={(e) => (e.target as HTMLElement).closest("a") && setMoreOpen(false)}
          className="bg-background fixed inset-0 z-40 overflow-y-auto px-4 pt-6 pb-28 lg:hidden"
        >
          <Sidebar side={side} badges={badges} hidden={hidden} expanded />
        </div>
      ) : null}
      <nav
        aria-label={t("label")}
        className="border-border bg-surface/90 fixed inset-x-0 bottom-0 z-50 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
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
                  <Icon icon={icon} anim={anim} className="size-5" />
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
              onClick={() => setMoreOpen((o) => !o)}
              className={tab}
              aria-current={moreOpen ? "page" : undefined}
            >
              <span className={pill}>
                {moreOpen ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
              </span>
              <span>{t("more")}</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
