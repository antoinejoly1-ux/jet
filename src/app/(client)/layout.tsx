import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { requireAccess } from "@/lib/auth/session";

export default async function ClientLayout({ children }: { children: ReactNode }) {
  const viewer = await requireAccess();
  return (
    <AppShell side="client" viewer={viewer}>
      {children}
    </AppShell>
  );
}
