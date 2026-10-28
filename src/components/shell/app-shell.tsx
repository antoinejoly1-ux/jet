import { Eye } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { exitViewAsAction } from "@/app/actions/view-as";
import type { ReactNode } from "react";
import { financeOwnerIds } from "@/lib/auth/policy";
import type { Viewer } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { unreadMessageCount } from "@/lib/services/messages";
import { unreadNotificationCount } from "@/lib/services/notification-center";
import { NotificationBell } from "./bell";
import { Logo, Star } from "@/components/brand/logo";
import { TeamReach } from "@/components/brand/team";
import { env } from "@/lib/env";
import { BottomTabs, FloatingAction, Rail, type Fab, type Side } from "./nav";
import { SideToggle } from "./side-toggle";
import { UserMenu } from "./user-menu";
import { telHref } from "@/lib/phone";

const FINANCE_PAGES = ["finances", "invoices"];

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
  const badges = { messages };
  // Members who don't see any owner's finances don't get the finance pages.
  const hidden = side === "client" && !viewer.staffRole && financeOwnerIds(viewer).length === 0 ? FINANCE_PAGES : [];
  const phone = env.OPERATOR_PHONE;
  const fab: Fab | null =
    side === "admin"
      ? viewer.staffRole === "dispatcher" || viewer.staffRole === "admin"
        ? { kind: "newFlight", href: "/admin/flights/new" }
        : null
      : phone && !viewer.viewingAs
        ? { kind: "call", href: telHref(phone) }
        : null;
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
      <div className="min-h-dvh lg:grid lg:grid-cols-[76px_1fr]">
        <aside className="border-border sticky top-0 hidden h-dvh flex-col items-center justify-between border-r py-6 lg:flex">
          <Link
            href={side === "admin" ? "/admin" : "/"}
            aria-label="Univair Management"
            className="text-text flex size-11 items-center justify-center"
          >
            <Star className="h-3 w-auto" />
          </Link>
          <Rail side={side} badges={badges} hidden={hidden} />
          <div className="flex h-12 items-center">{fab ? <FloatingAction fab={fab} /> : null}</div>
        </aside>
        <div className="flex min-w-0 flex-col">
          <header className="bg-background/75 sticky top-0 z-30 grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 backdrop-blur-xl sm:px-6 lg:h-[76px] lg:px-10">
            <p className="eyebrow hidden truncate sm:block">{tShell(side === "admin" ? "admin" : "client")}</p>
            <div className="col-start-2">
              <CenterLogo side={side} />
            </div>
            <div className="col-start-3 flex items-center justify-end gap-2 sm:gap-3">
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
        <BottomTabs side={side} badges={badges} hidden={hidden} footer={side === "client" ? <TeamReach /> : null} />
      </div>
    </>
  );
}
