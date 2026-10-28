"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth/auth-client";
import { Avatar } from "@/components/ui/avatar";
import { AnimatedIcon } from "@/components/animated-icons/AnimatedIcon";

export function UserMenu({
  name,
  email,
  image,
  settings = true,
}: {
  name: string;
  email: string;
  image?: string | null;
  /** Pilots have no Settings page: the menu then only signs out. */
  settings?: boolean;
}) {
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
        className="rounded-full"
      >
        <Avatar name={name} image={image} className="size-11" />
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
          {settings ? (
            <Link
              role="menuitem"
              href="/account"
              onClick={() => setOpen(false)}
              className="ai-trigger hover:bg-surface-muted flex h-11 items-center gap-2 rounded-full px-3 text-sm"
            >
              <AnimatedIcon name="user" size={18} />
              {t("account")}
            </Link>
          ) : null}
          <button
            role="menuitem"
            type="button"
            onClick={signOut}
            className="ai-trigger hover:bg-surface-muted flex h-11 w-full items-center gap-2 rounded-full px-3 text-sm"
          >
            <AnimatedIcon name="logout" size={18} />
            {t("signOut")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
