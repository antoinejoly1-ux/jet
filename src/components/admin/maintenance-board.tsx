"use client";

import { AlertCircle, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  startTransition,
  useCallback,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { FormState } from "@/lib/forms";
import { idle } from "@/lib/forms";
import { BOARD_COLUMNS, dragRefusal, type BoardColumn } from "@/lib/maintenance-board";
import { cn } from "@/lib/utils";

export type BoardItem = {
  id: string;
  status: BoardColumn;
  title: string;
  /** In review, sent there by this person: someone else approves it. */
  awaitingOther: boolean;
  /** The card's content, rendered on the server. */
  card: ReactNode;
};

type MoveAction = (id: string, status: BoardColumn, prev: FormState) => Promise<FormState>;

const DOT = { planned: "bg-accent", in_progress: "bg-warning", review: "bg-bronze", done: "bg-success" } as const;
/** A touch has to rest this long on a card before it lifts, so a swipe still scrolls the board. */
const LONG_PRESS_MS = 250;
/** How far a mouse moves before a press becomes a drag (a shorter move is a click). */
const MOUSE_SLOP = 4;
/** How far a finger may wander during the long press before it counts as a scroll. */
const TOUCH_SLOP = 8;
const EDGE = 48;

type Press = {
  id: string;
  from: BoardColumn;
  pointerId: number;
  touch: boolean;
  startX: number;
  startY: number;
  el: HTMLElement;
  timer?: ReturnType<typeof setTimeout>;
  dragging: boolean;
};

type Drag = {
  id: string;
  from: BoardColumn;
  width: number;
  offsetX: number;
  offsetY: number;
  x: number;
  y: number;
};

/**
 * The maintenance board's columns, with cards that can be dragged to the next
 * column (mouse, pen or a long press on touch). A drop moves the card at once
 * and asks the server; if the service refuses, the card goes back and the
 * reason shows. The buttons on each card stay for keyboards and screen readers.
 */
export function MaintenanceBoard({
  items,
  canWrite,
  moveAction,
}: {
  items: BoardItem[];
  canWrite: boolean;
  moveAction: MoveAction;
}) {
  const t = useTranslations("maintenance");
  const te = useTranslations("formErrors");
  const tt = useTranslations("toasts");
  const [board, move] = useOptimistic(items, (current, m: { id: string; status: BoardColumn }) =>
    current.map((i) => (i.id === m.id ? { ...i, status: m.status } : i)),
  );
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<BoardColumn | null>(null);
  const [notice, setNotice] = useState<{ key: number; text: string } | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const press = useRef<Press | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const overRef = useRef<BoardColumn | null>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const detach = useRef<() => void>(() => {});

  const column = useCallback((c: BoardColumn) => t(`columns.${c}`), [t]);
  const refusalText = useCallback(
    (from: BoardColumn, to: BoardColumn, awaitingOther: boolean) => {
      const r = dragRefusal(from, to, awaitingOther);
      if (!r) return null;
      if (r.reason === "oneStep") return t("board.oneStep", { next: column(r.next) });
      if (r.reason === "noWayBack") return t("board.noWayBack", { column: column(to) });
      return te(r.reason);
    },
    [t, te, column],
  );

  const tell = useCallback((text: string) => {
    setNotice({ key: Date.now(), text });
    setAnnouncement(text);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const hitColumn = useCallback((x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-column]");
    return (el?.dataset.column as BoardColumn | undefined) ?? null;
  }, []);

  const track = useCallback(() => {
    const { x, y } = pointer.current;
    const d = press.current;
    // The overlay is placed where the drag started; only translate it here (no re-render per move).
    if (overlay.current && d) overlay.current.style.translate = `${x - d.startX}px ${y - d.startY}px`;
    const c = hitColumn(x, y);
    if (c !== overRef.current) {
      overRef.current = c;
      setOver(c);
    }
  }, [hitColumn]);

  const end = useCallback(
    (drop: boolean) => {
      const p = press.current;
      detach.current();
      press.current = null;
      if (!p) return;
      clearTimeout(p.timer);
      if (!p.dragging) return;
      const target = overRef.current;
      overRef.current = null;
      setOver(null);
      setDrag(null);
      // The pointer is released over the card's old place: don't let that become a click on a link.
      const swallow = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);

      const item = items.find((i) => i.id === p.id);
      if (!drop || !target || target === p.from || !item) {
        setAnnouncement(t("board.dropped", { title: item?.title ?? "" }));
        return;
      }
      const refused = refusalText(p.from, target, item.awaitingOther);
      if (refused) {
        tell(refused);
        return;
      }
      setAnnouncement(t("board.moved", { title: item.title, column: column(target) }));
      startTransition(async () => {
        move({ id: item.id, status: target });
        const result = await moveAction(item.id, target, idle);
        if (result.status === "error") {
          const reason = result.code && te.has(result.code) ? te(result.code) : te("generic");
          tell(t("board.reverted", { title: item.title, column: column(p.from), reason }));
        }
      });
    },
    [items, t, te, column, refusalText, tell, move, moveAction],
  );

  const lift = useCallback(() => {
    const p = press.current;
    if (!p) return;
    p.dragging = true;
    const r = p.el.getBoundingClientRect();
    window.getSelection()?.removeAllRanges();
    setDrag({
      id: p.id,
      from: p.from,
      width: r.width,
      offsetX: p.startX - r.left,
      offsetY: p.startY - r.top,
      x: p.startX,
      y: p.startY,
    });
    overRef.current = p.from;
    setOver(p.from);
    const item = items.find((i) => i.id === p.id);
    setAnnouncement(t("board.picked", { title: item?.title ?? "" }));
  }, [items, t]);

  const begin = (e: ReactPointerEvent<HTMLElement>, item: BoardItem) => {
    if (!canWrite || item.status === "done" || press.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Buttons and fields on the card keep working as they are.
    if ((e.target as HTMLElement).closest("button, input, select, textarea, label, [role='dialog']")) return;
    const touch = e.pointerType === "touch";
    const p: Press = {
      id: item.id,
      from: item.status,
      pointerId: e.pointerId,
      touch,
      startX: e.clientX,
      startY: e.clientY,
      el: e.currentTarget,
      dragging: false,
    };
    press.current = p;
    pointer.current = { x: e.clientX, y: e.clientY };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== p.pointerId) return;
      pointer.current = { x: ev.clientX, y: ev.clientY };
      if (!p.dragging) {
        const dist = Math.hypot(ev.clientX - p.startX, ev.clientY - p.startY);
        if (p.touch) {
          if (dist > TOUCH_SLOP) end(false); // a swipe: let the board scroll
        } else if (dist > MOUSE_SLOP) lift();
        return;
      }
      ev.preventDefault();
      track();
    };
    const onUp = (ev: PointerEvent) => ev.pointerId === p.pointerId && end(true);
    const onCancel = (ev: PointerEvent) => ev.pointerId === p.pointerId && end(false);
    // Once a touch drag has started, the finger moves the card, not the page.
    const onTouchMove = (ev: TouchEvent) => p.dragging && ev.cancelable && ev.preventDefault();
    const onContextMenu = (ev: Event) => ev.preventDefault();
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && end(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKey);
    detach.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKey);
      detach.current = () => {};
    };
    if (touch) p.timer = setTimeout(lift, LONG_PRESS_MS);
  };

  // While dragging near the board's left or right edge (phones), scroll it.
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    let frame = 0;
    const step = () => {
      const s = scroller.current;
      if (s && s.scrollWidth > s.clientWidth) {
        const r = s.getBoundingClientRect();
        const { x } = pointer.current;
        const by = x < r.left + EDGE ? -12 : x > r.right - EDGE ? 12 : 0;
        if (by) {
          s.scrollLeft += by;
          track();
        }
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [dragging, track]);

  useEffect(() => () => detach.current(), []);

  const dragged = drag ? board.find((i) => i.id === drag.id) : undefined;

  return (
    <>
      <div ref={scroller} className="-mx-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0">
        <div className={cn("grid min-w-[1040px] grid-cols-4 gap-4 lg:min-w-0", drag && "select-none")}>
          {BOARD_COLUMNS.map((c) => {
            const rows = board.filter((r) => r.status === c).slice(0, c === "done" ? 30 : 100);
            const allowed =
              drag && dragged ? c === drag.from || !dragRefusal(drag.from, c, dragged.awaitingOther) : true;
            const target = drag && over === c && c !== drag.from && allowed;
            return (
              <section
                key={c}
                data-column={c}
                aria-labelledby={`col-${c}`}
                className={cn(
                  "bg-surface-muted/50 flex min-h-48 flex-col gap-3 rounded-[22px] p-3 transition-[opacity,box-shadow,background-color] duration-150",
                  drag && !allowed && "opacity-40",
                  target && "bg-accent/10 ring-accent ring-2",
                )}
              >
                <h2 id={`col-${c}`} className="flex items-center gap-2 px-2 pt-1 text-sm font-medium">
                  <span className={cn("size-2 rounded-full", DOT[c])} aria-hidden />
                  {column(c)}
                  <span className="text-muted tabular ml-auto text-xs">{rows.length}</span>
                </h2>
                {rows.length === 0 ? (
                  <p className="text-muted px-2 py-6 text-center text-xs">{t("columnEmpty")}</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {rows.map((r) => {
                      const draggable = canWrite && r.status !== "done";
                      return (
                        <li
                          key={r.id}
                          data-card={r.id}
                          onPointerDown={draggable ? (e) => begin(e, r) : undefined}
                          onDragStart={draggable ? (e) => e.preventDefault() : undefined}
                          className={cn(
                            "bg-surface border-border rounded-[16px] border p-4 shadow-sm transition-opacity",
                            draggable && "cursor-grab select-none [-webkit-touch-callout:none] active:cursor-grabbing",
                            drag?.id === r.id && "opacity-40",
                          )}
                        >
                          {r.card}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>
      {drag && dragged
        ? createPortal(
            <div
              ref={overlay}
              aria-hidden
              inert
              className="pointer-events-none fixed z-[70] cursor-grabbing"
              style={{ left: drag.x - drag.offsetX, top: drag.y - drag.offsetY, width: drag.width }}
            >
              <div className="bg-surface border-border shadow-float scale-[1.03] rotate-1 rounded-[16px] border p-4">
                {dragged.card}
              </div>
            </div>,
            document.body,
          )
        : null}
      <p className="sr-only" aria-live="polite" aria-atomic>
        {announcement}
      </p>
      {notice ? (
        <div
          key={notice.key}
          role="alert"
          className="animate-rise border-border bg-surface shadow-float fixed inset-x-4 bottom-24 z-[60] mx-auto flex max-w-md items-center gap-3 rounded-[22px] border py-2 pr-2 pl-4 text-sm lg:bottom-8"
        >
          <AlertCircle className="text-danger size-5 shrink-0" strokeWidth={1.5} aria-hidden />
          <span className="flex-1">{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label={tt("close")}
            className="text-muted hover:text-text hover:bg-surface-muted flex size-9 shrink-0 items-center justify-center rounded-full"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}
    </>
  );
}
