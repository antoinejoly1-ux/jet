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

type Item = { href: Route; key: string; icon: LucideIcon; mobile?: boolean };
type Group = { key: string | null; items: Item[] };

const CLIENT: Group[] = [
  {
    key: null,
    items: [
      { href: "/", key: "home", icon: Home, mobile: true },
      { href: "/flights", key: "flights", icon: PlaneTakeoff, mobile: true },
      { href: "/availability", key: "availability", icon: CalendarDays, mobile: true },
      { href: "/finances", key: "finances", icon: Wallet, mobile: true },
      { href: "/invoices", key: "invoices", icon: FileText },
      { href: "/aircraft", key: "aircraft", icon: Plane },
      // Owners call or text more than they chat, so Messages stays out of the phone tabs.
      { href: "/messages", key: "messages", icon: MessageSquare },
    ],
  },
];

const ADMIN: Group[] = [
  {
    key: "operations",
    items: [
      { href: "/admin", key: "dashboard", icon: Gauge, mobile: true },
      { href: "/admin/aircraft", key: "aircraft", icon: Plane },
      { href: "/admin/flights", key: "flights", icon: PlaneTakeoff, mobile: true },
      { href: "/admin/maintenance", key: "maintenance", icon: Wrench },
      { href: "/admin/messages", key: "messages", icon: Inbox, mobile: true },
    ],
  },
  {
    key: "clients",
    items: [
      { href: "/admin/owners", key: "owners", icon: Users, mobile: true },
      { href: "/admin/holding-companies", key: "holdingCompanies", icon: Building2 },
      { href: "/admin/invitations", key: "invitations", icon: MailPlus },
    ],
  },
  {
    key: "finance",
    items: [
      { href: "/admin/budgets", key: "budgets", icon: BarChart3 },
      { href: "/admin/transactions", key: "transactions", icon: ClipboardList },
      { href: "/admin/invoices", key: "invoices", icon: FileText },
      { href: "/admin/imports", key: "imports", icon: Upload },
    ],
  },
  { key: "settings", items: [{ href: "/admin/settings", key: "settings", icon: Settings }] },
];

/** The side's destinations, minus any the viewer has no access to (by item key). */
const groupsFor = (side: Side, hidden: readonly string[] = []) =>
  (side === "admin" ? ADMIN : CLIENT).map((g) => ({ ...g, items: g.items.filter((i) => !hidden.includes(i.key)) }));

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => (href === "/" || href === "/admin" ? pathname === href : pathname.startsWith(href));
}

/** Desktop sidebar (1024px and up). */
export function Sidebar({ side, badges = {}, hidden }: { side: Side; badges?: Badges; hidden?: readonly string[] }) {
  const t = useTranslations("nav");
  const isActive = useIsActive();
  return (
    <nav aria-label={t("label")} className="flex flex-col gap-6">
      {groupsFor(side, hidden).map((group) => (
        <div key={group.key ?? "main"}>
          {group.key ? (
            <p className="text-muted mb-2 px-3 text-xs font-semibold tracking-wider uppercase">
              {t(`groups.${group.key}`)}
            </p>
          ) : null}
          <ul className="flex flex-col gap-0.5">
            {group.items.map(({ href, key, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive(href) ? "page" : undefined}
                  className={cn(
                    "text-muted hover:bg-surface-muted hover:text-text flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                    "aria-[current=page]:bg-surface-muted aria-[current=page]:text-text",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
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

/**
 * Phone and tablet bottom tab bar: the four most used destinations of the
 * current side, plus "More", which opens every destination in a sheet.
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
    "flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted aria-[current=page]:text-text";
  return (
    <>
      {moreOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("more")}
          // Close the sheet once a destination is picked.
          onClick={(e) => (e.target as HTMLElement).closest("a") && setMoreOpen(false)}
          className="bg-surface fixed inset-0 z-40 overflow-y-auto px-3 pt-6 pb-28 lg:hidden"
        >
          <Sidebar side={side} badges={badges} hidden={hidden} />
        </div>
      ) : null}
      <nav
        aria-label={t("label")}
        className="border-border bg-surface/95 fixed inset-x-0 bottom-0 z-50 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))` }}>
          {items.map(({ href, key, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive(href) && !moreOpen ? "page" : undefined}
                className={cn(tab, "relative")}
              >
                <Icon className="size-5" aria-hidden />
                <Count n={badges[key]} className="absolute top-2 left-1/2 ml-1" />
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
              {moreOpen ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
              <span>{t("more")}</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
