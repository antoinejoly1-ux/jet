import Link from "next/link";
import type { ReactNode } from "react";
import type { Viewer } from "@/lib/auth/session";
import { BottomTabs, Sidebar, type Side } from "./nav";
import { SideToggle } from "./side-toggle";
import { UserMenu } from "./user-menu";

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
export function AppShell({ side, viewer, children }: { side: Side; viewer: Viewer; children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="border-border bg-surface sticky top-0 hidden h-dvh flex-col gap-8 border-r px-3 py-5 lg:flex">
        <div className="px-3">
          <Wordmark />
        </div>
        <Sidebar side={side} />
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="border-border bg-background/90 sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b px-4 backdrop-blur sm:px-6 lg:px-10">
          <div className="lg:hidden">
            <Wordmark />
          </div>
          <div className="ml-auto flex items-center gap-3">
            {viewer.staffRole ? <SideToggle current={side} /> : null}
            <UserMenu name={viewer.name} email={viewer.email} />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-12">
          {children}
        </main>
      </div>
      <BottomTabs side={side} />
    </div>
  );
}
