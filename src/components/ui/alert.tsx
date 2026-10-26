import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Alert({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "danger" | "success";
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-3 py-2.5 text-sm",
        tone === "danger" && "border-danger/30 bg-danger/8 text-danger",
        tone === "success" && "border-success/30 bg-success/8 text-success",
        tone === "neutral" && "border-border bg-surface-muted text-text",
      )}
    >
      {children}
    </div>
  );
}
