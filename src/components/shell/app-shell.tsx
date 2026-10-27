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
import { ProductMark, Star } from "@/components/brand/logo";
import { env } from "@/lib/env";
import { BottomTabs, FloatingAction, Sidebar, type Fab, type Side } from "./nav";
import { SideToggle } from "./side-toggle";
import { UserMenu } from "./user-menu";

const FINANCE_PAGES = ["finances", "invoices"];

function Wordmark({ side }: { side: Side }) {
  return (
    <Link href={side === "admin" ? "/admin" : "/"} className="text-text">
      <ProductMark compact />
    </Link>
  );
}

/** The star alone, at the top of the narrow rail. */
function RailStar({ side }: { side: Side }) {
  return (
    <Link
      href={side === "admin" ? "/admin" : "/"}
      aria-label="Univair Management"
      className="bg-surface text-text shadow-card flex size-12 items-center justify-center rounded-full"
    >
      <Star className="h-3 w-auto" />
    </Link>
  );
}

/**
 * The persistent frame around every signed-in page. Sidebar from 1024px up,
 * bottom tab bar below that. Staff get the Client | Admin toggle in the top bar.
 */
export async function AppShell({ side, viewer, children }: { side: Side; viewer: Viewer; children: ReactNode }) {
  const t = await getTranslations("viewAs");
  const [messages, notifications] = await Promise.all([
    unreadMessageCount(db, viewer, side),
    unreadNotificationCount(db, viewer),
  ]);
  const badges = { messages };
  // Members who don't see any owner's finances don't get the finance pages.
  const hidden = side === "client" && !viewer.staffRole && financeOwnerIds(viewer).length === 0 ? FINANCE_PAGES : [];
  const phone = env.OPERATOR_PHONE.replace(/[^\d+]/g, "");
  const fab: Fab | null =
    side === "admin"
      ? viewer.staffRole === "dispatcher" || viewer.staffRole === "admin"
        ? { kind: "newFlight", href: "/admin/flights/new" }
        : null
      : phone && !viewer.viewingAs
        ? { kind: "call", href: `tel:${phone}` }
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
      <div className="min-h-dvh lg:grid lg:grid-cols-[88px_1fr] xl:grid-cols-[256px_1fr]">
        <aside className="border-border sticky top-0 hidden h-dvh flex-col items-stretch gap-6 overflow-y-auto border-r px-4 py-5 lg:flex xl:px-4">
          <div className="flex justify-center xl:hidden">
            <RailStar side={side} />
          </div>
          <div className="hidden px-3 pt-2 xl:block">
            <Wordmark side={side} />
          </div>
          <div className="flex-1">
            <Sidebar side={side} badges={badges} hidden={hidden} />
          </div>
          {fab ? (
            <div className="flex justify-center pb-2 xl:justify-stretch">
              <FloatingAction fab={fab} />
            </div>
          ) : null}
        </aside>
        <div className="flex min-w-0 flex-col">
          <header className="bg-background/80 sticky top-0 z-20 flex h-16 items-center justify-between gap-3 px-4 backdrop-blur-xl sm:px-6 lg:h-20 lg:px-10">
            <div className="lg:hidden">
              <Wordmark side={side} />
            </div>
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              {viewer.staffRole ? <SideToggle current={side} /> : null}
              <NotificationBell side={side} unread={notifications} />
              <UserMenu name={viewer.name} email={viewer.email} />
            </div>
          </header>
          <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pt-4 pb-28 sm:px-6 lg:px-10 lg:pt-2 lg:pb-16">
            {children}
          </main>
        </div>
        <BottomTabs side={side} badges={badges} hidden={hidden} />
      </div>
    </>
  );
}
