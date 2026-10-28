"use client";

import { Building2, FileText, Inbox, MailPlus, Plane, PlaneTakeoff, Search, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ComponentType } from "react";
import type { Route } from "next";
import { cn } from "@/lib/utils";

type Hit = {
  kind: "owner" | "company" | "aircraft" | "invoice" | "conversation";
  id: string;
  title: string;
  detail: string | null;
  href: string;
};
type Entry = {
  key: string;
  label: string;
  detail?: string | null;
  href: string;
  icon: ComponentType<{ className?: string }>;
};

const ICON: Record<Hit["kind"], Entry["icon"]> = {
  aircraft: Plane,
  owner: Users,
  company: Building2,
  invoice: FileText,
  conversation: Inbox,
};

/**
 * ⌘K / Ctrl-K: find an owner, an aircraft, a company, an invoice or a
 * conversation by typing, or jump straight to a frequent action. A search
 * button in the top bar opens it on touch screens.
 */
export function CommandPalette() {
  const t = useTranslations("search");
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);

  const open = () => {
    setQ("");
    setHits([]);
    setActive(0);
    dialog.current?.showModal();
    input.current?.focus();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (dialog.current?.open) dialog.current.close();
        else open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (res.ok) {
          setHits((await res.json()) as Hit[]);
          setActive(0);
        }
      } catch {
        // Aborted or offline: keep what's shown.
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  const actions: Entry[] = [
    { key: "newFlight", label: t("actions.newFlight"), href: "/admin/flights/new", icon: PlaneTakeoff },
    { key: "newOwner", label: t("actions.newOwner"), href: "/admin/owners/new", icon: UserPlus },
    { key: "invite", label: t("actions.invite"), href: "/admin/invitations", icon: MailPlus },
  ];
  const entries: Entry[] =
    q.trim().length < 2
      ? actions
      : hits.map((h) => ({
          key: `${h.kind}-${h.id}`,
          label: h.title,
          detail: h.detail ? `${t(`kinds.${h.kind}`)} · ${h.detail}` : t(`kinds.${h.kind}`),
          href: h.href,
          icon: ICON[h.kind],
        }));

  const go = (e: Entry) => {
    dialog.current?.close();
    router.push(e.href as Route);
  };

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label={t("open")}
        title={`${t("open")} (⌘K)`}
        className="border-border hover:bg-surface-muted text-muted hover:text-text inline-flex size-11 items-center justify-center rounded-full border"
      >
        <Search className="size-4" strokeWidth={1.5} aria-hidden />
      </button>
      <dialog
        ref={dialog}
        aria-label={t("open")}
        className="bg-surface text-text border-border fixed inset-x-4 top-[12vh] m-0 mx-auto w-auto max-w-xl rounded-[22px] border p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm sm:inset-x-0"
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
      >
        <div className="border-border flex items-center gap-3 border-b px-5">
          <Search className="text-muted size-4 shrink-0" strokeWidth={1.5} aria-hidden />
          <input
            ref={input}
            role="combobox"
            aria-expanded
            aria-controls="palette-list"
            aria-activedescendant={entries[active] ? `palette-${entries[active]!.key}` : undefined}
            aria-label={t("open")}
            placeholder={t("placeholder")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(entries.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter" && entries[active]) {
                e.preventDefault();
                go(entries[active]!);
              }
            }}
            className="h-14 flex-1 bg-transparent text-base outline-none"
          />
          <kbd className="text-muted border-border hidden rounded-md border px-1.5 py-0.5 text-[11px] sm:block">
            Esc
          </kbd>
        </div>
        <p className="eyebrow px-5 pt-4 pb-2">{q.trim().length < 2 ? t("actionsTitle") : t("resultsTitle")}</p>
        {entries.length === 0 ? (
          <p className="text-muted px-5 pb-6 text-sm">{t("empty")}</p>
        ) : (
          <ul
            id="palette-list"
            role="listbox"
            aria-label={t("resultsTitle")}
            className="max-h-[50vh] overflow-y-auto p-2"
          >
            {entries.map((e, i) => {
              const Icon = e.icon;
              return (
                <li
                  key={e.key}
                  id={`palette-${e.key}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(e)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-[14px] px-3 py-3",
                    i === active && "bg-surface-muted",
                  )}
                >
                  <Icon className="text-muted size-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{e.label}</span>
                    {e.detail ? <span className="text-muted block truncate text-xs">{e.detail}</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </dialog>
    </>
  );
}
