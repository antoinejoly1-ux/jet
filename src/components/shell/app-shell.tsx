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
import { BottomTabs, Sidebar, type Side } from "./nav";
import { SideToggle } from "./side-toggle";
import { UserMenu } from "./user-menu";

const FINANCE_PAGES = ["finances", "invoices"];

function Wordmark() {
  return (
    <Link href="/" className="text-lg font-extrabold tracking-tight">
      Jet
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
      <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
        <aside className="border-border bg-surface sticky top-0 hidden h-dvh flex-col gap-8 border-r px-3 py-5 lg:flex">
          <div className="px-3">
            <Wordmark />
          </div>
          <Sidebar side={side} badges={badges} hidden={hidden} />
        </aside>
        <div className="flex min-w-0 flex-col">
          <header className="border-border bg-background/90 sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b px-4 backdrop-blur sm:px-6 lg:px-10">
            <div className="lg:hidden">
              <Wordmark />
            </div>
            <div className="ml-auto flex items-center gap-3">
              {viewer.staffRole ? <SideToggle current={side} /> : null}
              <NotificationBell side={side} unread={notifications} />
              <UserMenu name={viewer.name} email={viewer.email} />
            </div>
          </header>
          <main
            id="main"
            className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-12"
          >
            {children}
          </main>
        </div>
        <BottomTabs side={side} badges={badges} hidden={hidden} />
      </div>
    </>
  );
}
