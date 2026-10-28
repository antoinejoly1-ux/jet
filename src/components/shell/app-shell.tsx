import { Eye } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { exitViewAsAction } from "@/app/actions/view-as";
import type { ReactNode } from "react";
import { financeOwnerIds } from "@/lib/auth/policy";
import type { Viewer } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { unreadMessageCount } from "@/lib/services/messages";
import { unreadNotificationCount } from "@/lib/services/notification-center";
import { countReportsWaiting } from "@/lib/services/flight-reports";
import { NotificationBell } from "./bell";
import { Logo, Star } from "@/components/brand/logo";
import { TeamReach } from "@/components/brand/team";
import { env } from "@/lib/env";
import { BottomTabs, RAIL_COOKIE, Sidebar, type Fab, type Side } from "./nav";
import { CommandPalette } from "./command-palette";
import { SideToggle } from "./side-toggle";
import { UserMenu } from "./user-menu";
import { readFlash } from "@/lib/flash";
import { telHref } from "@/lib/phone";
import { Toast } from "@/components/ui/toast";

const FINANCE_PAGES = ["finances", "invoices"];
const OWNER_PAGES = ["home", "availability", "flights", "messages", "aircraft"];

/** The Univair wordmark, centered at the top of every signed-in page. */
function CenterLogo({ side }: { side: Side }) {
  return (
    <Link href={side === "admin" ? "/admin" : "/"} className="text-text flex flex-col items-center gap-1">
      <Logo className="h-[18px] w-auto sm:h-[22px]" title="Univair Management" />
      <span aria-hidden className="text-muted hidden text-[8px] font-medium tracking-[0.5em] uppercase sm:block">
        Management
      </span>
    </Link>
  );
}

/**
 * The persistent frame around every signed-in page. Sidebar from 1024px up,
 * bottom tab bar below that. Staff get the Client | Admin toggle in the top bar.
 */
export async function AppShell({ side, viewer, children }: { side: Side; viewer: Viewer; children: ReactNode }) {
  const t = await getTranslations("viewAs");
  const tShell = await getTranslations("shell");
  const [messages, notifications] = await Promise.all([
    unreadMessageCount(db, viewer, side),
    unreadNotificationCount(db, viewer),
  ]);
  const reports = side === "admin" ? await countReportsWaiting(db, viewer) : 0;
  const badges = { messages, flightReports: reports };
  // Members who don't see any owner's finances don't get the finance pages.
  const hidden =
    side !== "client"
      ? []
      : [
          ...(!viewer.staffRole && financeOwnerIds(viewer).length === 0 ? FINANCE_PAGES : []),
          // Invoicing is for the people who run a holding company's books.
          ...(viewer.managedCompanyIds?.length ? [] : ["billing"]),
          // Someone who only runs a company's books has no aircraft of their own to show.
          ...(!viewer.staffRole && viewer.ownerIds.length === 0 ? OWNER_PAGES : []),
        ];
  const phone = env.OPERATOR_PHONE;
  const fab: Fab | null =
    side === "admin"
      ? viewer.staffRole === "dispatcher" || viewer.staffRole === "admin"
        ? { kind: "newFlight", href: "/admin/flights/new" }
        : null
      : viewer.viewingAs || (!viewer.staffRole && viewer.ownerIds.length === 0)
        ? null
        : { kind: "request", callHref: phone ? telHref(phone) : null };
  const expanded = (await cookies()).get(RAIL_COOKIE)?.value === "open";
  const toast = await readFlash();
  const tToast = await getTranslations("toasts");
  return (
    <>
      {viewer.viewingAs ? (
        <div
          role="status"
          className="bg-accent sticky top-0 z-40 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-2 text-sm font-medium text-white"
        >
          <span className="inline-flex items-center gap-2">
            <Eye className="size-4" aria-hidden />
            {t("banner", { name: viewer.viewingAs.ownerName })}
          </span>
          <form action={exitViewAsAction}>
            <button type="submit" className="rounded-md bg-white/15 px-3 py-1 font-semibold hover:bg-white/25">
              {t("exit")}
            </button>
          </form>
        </div>
      ) : null}
      <div
        data-shell
        className="min-h-dvh lg:grid lg:grid-cols-[var(--rail)_1fr]"
        style={{ "--rail": expanded ? "232px" : "76px" } as React.CSSProperties}
      >
        <Sidebar
          side={side}
          badges={badges}
          hidden={hidden}
          fab={fab}
          expanded={expanded}
          home={
            <Link
              href={side === "admin" ? "/admin" : "/"}
              aria-label="Univair Management"
              className="text-text flex size-11 items-center justify-center"
            >
              <Star className="h-3 w-auto" />
            </Link>
          }
        />
        <div className="flex min-w-0 flex-col">
          <header className="bg-background/75 sticky top-0 z-30 grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 backdrop-blur-xl sm:px-6 lg:h-[76px] lg:px-10">
            <p className="eyebrow hidden truncate sm:block">{tShell(side === "admin" ? "admin" : "client")}</p>
            <div className="col-start-2">
              <CenterLogo side={side} />
            </div>
            <div className="col-start-3 flex items-center justify-end gap-2 sm:gap-3">
              {viewer.staffRole && side === "admin" ? <CommandPalette /> : null}
              {viewer.staffRole ? <SideToggle current={side} /> : null}
              <NotificationBell side={side} unread={notifications} />
              <UserMenu name={viewer.name} email={viewer.email} image={viewer.image} />
            </div>
          </header>
          <main
            id="main"
            className="mx-auto w-full max-w-[1320px] flex-1 px-4 pt-4 pb-28 sm:px-6 lg:px-10 lg:pt-6 lg:pb-16"
          >
            {children}
          </main>
        </div>
        {toast ? <Toast id={toast} message={tToast(toast)} closeLabel={tToast("close")} /> : null}
        <BottomTabs side={side} badges={badges} hidden={hidden} footer={side === "client" ? <TeamReach /> : null} />
      </div>
    </>
  );
}
