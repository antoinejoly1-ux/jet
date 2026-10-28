"use client";

import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Fragment, useEffect, useState } from "react";
import type { Route } from "next";
import { useRequestFlight } from "@/components/flights/request-flight";
import { AnimatedIcon, type AnimatedIconName } from "@/components/animated-icons/AnimatedIcon";
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

type Item = { href: Route; key: string; icon: AnimatedIconName; mobile?: boolean };
type Group = { key: string | null; items: Item[] };

const CLIENT: Group[] = [
  {
    key: null,
    items: [
      { href: "/", key: "home", icon: "home", mobile: true },
      { href: "/availability", key: "availability", icon: "calendar", mobile: true },
      { href: "/flights", key: "flights", icon: "list" },
      { href: "/messages", key: "messages", icon: "chat", mobile: true },
      { href: "/finances", key: "finances", icon: "wallet" },
      { href: "/invoices", key: "invoices", icon: "invoice" },
      { href: "/aircraft", key: "aircraft", icon: "plane" },
      { href: "/billing", key: "billing", icon: "receipt" },
    ],
  },
  { key: "settings", items: [{ href: "/account", key: "settings", icon: "settings" }] },
];

const ADMIN: Group[] = [
  {
    key: "operations",
    items: [
      { href: "/admin", key: "dashboard", icon: "gauge", mobile: true },
      { href: "/admin/aircraft", key: "aircraft", icon: "plane" },
      { href: "/admin/flights", key: "flights", icon: "planeTakeoff", mobile: true },
      { href: "/admin/maintenance", key: "maintenance", icon: "wrench" },
      { href: "/admin/messages", key: "messages", icon: "inbox", mobile: true },
    ],
  },
  {
    key: "clients",
    items: [{ href: "/admin/owners", key: "owners", icon: "people", mobile: true }],
  },
  {
    key: "finance",
    items: [
      { href: "/admin/flight-reports", key: "flightReports", icon: "clipboard" },
      { href: "/admin/transactions", key: "transactions", icon: "ledger" },
      { href: "/admin/invoices", key: "invoices", icon: "invoice" },
      { href: "/admin/imports", key: "imports", icon: "upload" },
    ],
  },
  { key: "settings", items: [{ href: "/admin/settings", key: "settings", icon: "settings" }] },
];

/** The side's destinations, minus any the viewer has no access to (by item key). */
const groupsFor = (side: Side, hidden: readonly string[] = []) =>
  (side === "admin" ? ADMIN : CLIENT)
    .map((g) => ({ ...g, items: g.items.filter((i) => !hidden.includes(i.key)) }))
    .filter((g) => g.items.length > 0);

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => (href === "/" || href === "/admin" ? pathname === href : pathname.startsWith(href));
}

/** Cookie remembering whether the desktop rail shows its labels. */
export const RAIL_COOKIE = "rail";

/**
 * The desktop sidebar: a 76px rail of icons (names as tooltips) that opens to
 * 232px with labels; the choice is remembered. The current page sits in an
 * ivory pill.
 */
export function Sidebar({
  side,
  badges = {},
  hidden,
  fab,
  expanded: initial,
  home,
}: {
  side: Side;
  badges?: Badges;
  hidden?: readonly string[];
  fab: Fab | null;
  expanded: boolean;
  /** The brand mark at the top. */
  home: React.ReactNode;
}) {
  const t = useTranslations("nav");
  const isActive = useIsActive();
  const [expanded, setExpanded] = useState(initial);
  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    document.cookie = `${RAIL_COOKIE}=${next ? "open" : "closed"}; path=/; max-age=31536000; samesite=lax`;
    document.querySelector<HTMLElement>("[data-shell]")?.style.setProperty("--rail", next ? "232px" : "76px");
  };
  return (
    <aside
      className={cn(
        "border-border sticky top-0 z-40 hidden h-dvh flex-col justify-between overflow-visible border-r py-6 lg:flex",
        expanded ? "items-stretch px-4" : "items-center",
      )}
    >
      <div className={cn("flex flex-col gap-6", expanded ? "items-stretch" : "items-center")}>
        {home}
        <nav aria-label={t("label")} className={cn("flex flex-col gap-3", !expanded && "items-center")}>
          {groupsFor(side, hidden).map((group, i) => (
            <div key={group.key ?? "main"} className={cn("flex flex-col gap-1", !expanded && "items-center")}>
              {i > 0 ? (
                expanded && group.key ? (
                  <p className="eyebrow mt-3 mb-1 px-3">{t(`groups.${group.key}`)}</p>
                ) : (
                  <div className="bg-border my-2 h-px w-6" aria-hidden />
                )
              ) : null}
              {group.items.map(({ href, key, icon }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive(href) ? "page" : undefined}
                  className={cn(
                    "group ai-trigger text-muted hover:text-text hover:bg-surface-muted relative flex items-center rounded-full transition-colors duration-300",
                    isActive(href) && "is-active",
                    "aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground",
                    expanded ? "h-11 gap-3 px-3.5" : "size-11 justify-center",
                  )}
                >
                  <AnimatedIcon name={icon} size={20} className="shrink-0" />
                  {expanded ? (
                    <>
                      <span className="flex-1 truncate text-sm">{t(`items.${key}`)}</span>
                      <Count n={badges[key]} />
                    </>
                  ) : (
                    <>
                      {badges[key] ? (
                        <span
                          className="bg-accent text-accent-foreground ring-background tabular absolute -top-0.5 -right-0.5 flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] leading-[18px] font-semibold ring-2"
                          aria-hidden
                        >
                          {badges[key]! > 9 ? "9+" : badges[key]}
                        </span>
                      ) : null}
                      {/* The tooltip doubles as the link's name, so the name is the visible label. */}
                      <span className="bg-primary text-primary-foreground shadow-float pointer-events-none absolute left-full z-50 ml-4 translate-x-1 rounded-full px-3.5 py-1.5 text-xs font-medium whitespace-nowrap opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100">
                        {t(`items.${key}`)}
                      </span>
                      {badges[key] ? <span className="sr-only"> · {t("unread", { count: badges[key]! })}</span> : null}
                    </>
                  )}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </div>
      <div className={cn("flex flex-col gap-4 pt-6", expanded ? "items-stretch" : "items-center")}>
        {fab ? <FloatingAction fab={fab} expanded={expanded} /> : null}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          className={cn(
            "text-muted hover:text-text hover:bg-surface-muted flex h-10 items-center gap-3 rounded-full text-xs transition-colors",
            expanded ? "px-3.5" : "w-10 justify-center",
          )}
        >
          {expanded ? (
            <PanelLeftClose className="size-4" strokeWidth={1.5} aria-hidden />
          ) : (
            <PanelLeftOpen className="size-4" strokeWidth={1.5} aria-hidden />
          )}
          <span className={cn(!expanded && "sr-only")}>{expanded ? t("collapse") : t("expand")}</span>
        </button>
      </div>
    </aside>
  );
}

/** Every destination with its name, large, for the phone "More" menu. */
function MenuList({
  side,
  badges = {},
  hidden,
}: {
  side: Side;
  badges?: Badges;
  /** Destinations not to list: those without access, and those already in the tab bar. */
  hidden?: readonly string[];
}) {
  const t = useTranslations("nav");
  const isActive = useIsActive();
  return (
    <nav aria-label={t("label")} className="flex flex-col gap-6">
      {groupsFor(side, hidden).map((group) => (
        <div key={group.key ?? "main"}>
          {group.key && group.items.length > 1 ? <p className="eyebrow mb-2">{t(`groups.${group.key}`)}</p> : null}
          <ul className="divide-border divide-y">
            {group.items.map(({ href, key, icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive(href) ? "page" : undefined}
                  className={cn(
                    "ai-trigger text-muted aria-[current=page]:text-text flex h-14 items-center gap-4 text-lg font-light",
                    isActive(href) && "is-active",
                  )}
                >
                  <AnimatedIcon name={icon} size={22} />
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
 * The action button at the foot of the sidebar: request a flight (owners who
 * can), call the team (other owner logins), or plan a flight (staff).
 */
export type Fab =
  { kind: "request"; callHref: string | null } | { kind: "call"; href: string } | { kind: "newFlight"; href: Route };

export function FloatingAction({ fab, expanded = false }: { fab: Fab; expanded?: boolean }) {
  const t = useTranslations("nav");
  const request = useRequestFlight();
  const kind = fab.kind === "request" && !request ? (fab.callHref ? "call" : null) : fab.kind;
  if (!kind) return null;
  const label = kind === "request" ? t("fabRequest") : kind === "call" ? t("fabCall") : t("fabNewFlight");
  const className = cn(
    "ai-trigger bg-accent text-accent-foreground shadow-float relative flex items-center justify-center gap-2.5 rounded-full transition-transform duration-300 hover:scale-105",
    expanded ? "h-12 px-5 text-sm font-medium" : "size-12",
  );
  const icon = (
    <AnimatedIcon name={kind === "request" ? "planeTakeoff" : kind === "call" ? "phone" : "plus"} size={22} />
  );
  const content = (
    <>
      {icon}
      {expanded ? <span>{label}</span> : null}
    </>
  );
  if (kind === "request")
    return (
      <button
        type="button"
        onClick={() => request?.()}
        aria-label={expanded ? undefined : label}
        title={label}
        className={className}
      >
        {content}
      </button>
    );
  const href = fab.kind === "request" ? fab.callHref! : fab.href;
  return (
    <a href={href} aria-label={expanded ? undefined : label} title={label} className={className}>
      {content}
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
  const request = useRequestFlight();
  const all = groupsFor(side, hidden).flatMap((g) => g.items);
  // People with few destinations (a company manager) get them as tabs rather than a lone "More".
  const mobile = all.filter((i) => i.mobile);
  const items = (mobile.length >= 2 ? mobile : [...mobile, ...all.filter((i) => !i.mobile)]).slice(0, 4);
  // Owners: the request button sits in the middle, the one action they come for.
  // Logins that can't request get Vols there instead.
  const center = side === "client" ? (request ? "request" : all.find((i) => i.key === "flights")) : null;
  const inTabs = [...items.map((i) => i.key), ...(center && center !== "request" ? [center.key] : [])];

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
    "group ai-trigger flex h-16 w-full flex-col items-center justify-center gap-1 text-[11.5px] font-medium tracking-[0.01em] text-muted aria-[current=page]:text-text";
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
          <MenuList side={side} badges={badges} hidden={[...(hidden ?? []), ...inTabs]} />
          {footer ? <div className="mt-10">{footer}</div> : null}
        </div>
      ) : null}
      <nav
        aria-label={t("label")}
        className="border-border bg-background fixed inset-x-0 bottom-0 z-50 border-t pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul
          className="grid"
          style={{ gridTemplateColumns: `repeat(${items.length + (center ? 2 : 1)}, minmax(0, 1fr))` }}
        >
          {items.map(({ href, key, icon }, i) => (
            <Fragment key={href}>
              {center && i === 2 ? (
                <li>
                  {center === "request" ? (
                    <button type="button" onClick={() => request?.()} className={tab}>
                      <span className="bg-accent text-accent-foreground shadow-float flex size-11 items-center justify-center rounded-full">
                        <AnimatedIcon name="planeTakeoff" size={22} />
                      </span>
                      <span>{t("tabs.request")}</span>
                    </button>
                  ) : (
                    <Link
                      href={center.href}
                      aria-current={isActive(center.href) && !moreOpen ? "page" : undefined}
                      className={cn(tab, isActive(center.href) && !moreOpen && "is-active")}
                    >
                      <span className={pill}>
                        <AnimatedIcon name={center.icon} size={20} />
                      </span>
                      <span>{t(`items.${center.key}`)}</span>
                    </Link>
                  )}
                </li>
              ) : null}
              <li>
                <Link
                  href={href}
                  aria-current={isActive(href) && !moreOpen ? "page" : undefined}
                  className={cn(tab, "relative", isActive(href) && !moreOpen && "is-active")}
                >
                  <span className={pill}>
                    <AnimatedIcon name={icon} size={20} />
                  </span>
                  <Count n={badges[key]} className="absolute top-1.5 left-1/2 ml-2" />
                  <span className="max-w-full truncate px-1">
                    {t.has(`tabs.${key}`) ? t(`tabs.${key}`) : t(`items.${key}`)}
                  </span>
                </Link>
              </li>
            </Fragment>
          ))}
          <li>
            <button
              type="button"
              aria-expanded={moreOpen}
              onClick={() => {
                setOpenedAt(pathname);
                setMoreOpen((o) => !o);
              }}
              className={cn(tab, moreOpen && "is-active")}
              aria-current={moreOpen ? "page" : undefined}
            >
              <span className={pill}>
                {moreOpen ? (
                  <X className="size-5" strokeWidth={1.75} aria-hidden />
                ) : (
                  <AnimatedIcon name="menu" size={20} />
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
