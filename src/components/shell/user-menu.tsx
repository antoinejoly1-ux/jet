"use client";

import { LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth/auth-client";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

export function UserMenu({ name, email }: { name: string; email: string }) {
  const t = useTranslations("userMenu");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  async function signOut() {
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("open")}
        onClick={() => setOpen((o) => !o)}
        className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-full text-sm font-semibold"
      >
        {initials(name) || "?"}
      </button>
      {open ? (
        <div
          role="menu"
          className="border-border bg-surface shadow-float absolute right-0 z-40 mt-2 w-64 rounded-[18px] border p-1.5"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="text-muted truncate text-xs">{email}</p>
          </div>
          <Link
            role="menuitem"
            href="/account"
            onClick={() => setOpen(false)}
            className="hover:bg-surface-muted flex h-10 items-center gap-2 rounded-full px-3 text-sm"
          >
            <UserRound className="size-4" aria-hidden />
            {t("account")}
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={signOut}
            className="hover:bg-surface-muted flex h-10 w-full items-center gap-2 rounded-full px-3 text-sm"
          >
            <LogOut className="size-4" aria-hidden />
            {t("signOut")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
