import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { requireStaff } from "@/lib/auth/session";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const viewer = await requireStaff();
  return (
    <AppShell side="admin" viewer={viewer}>
      {children}
    </AppShell>
  );
}
