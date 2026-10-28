/**
 * The moves a card may make on the maintenance board by drag and drop: the
 * same ones its buttons offer, one column at a time. The service has the final
 * word (it re-checks the transition and the four-eyes rule); this only lets
 * the board refuse a drop before it calls the server, and say why.
 */
export const BOARD_COLUMNS = ["planned", "in_progress", "review", "done"] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export const DRAG_MOVES: Record<BoardColumn, readonly BoardColumn[]> = {
  planned: ["in_progress"],
  in_progress: ["review"],
  // Approve, or send back to whoever is doing the work.
  review: ["done", "in_progress"],
  done: [],
};

export type DragRefusal =
  { reason: "oneStep"; next: BoardColumn } | { reason: "noWayBack" } | { reason: "maintenance_self_review" };

/**
 * Why a card can't go from `from` to `to`, or null when it can. A jump of more
 * than one column (Planifié → Terminé) is refused rather than chained: each
 * step is its own decision (starting, sending to review, approving).
 */
export function dragRefusal(from: BoardColumn, to: BoardColumn, awaitingOther = false): DragRefusal | null {
  if (from === to) return null;
  if (from === "review" && to === "done" && awaitingOther) return { reason: "maintenance_self_review" };
  if (DRAG_MOVES[from].includes(to)) return null;
  const i = BOARD_COLUMNS.indexOf(from);
  if (BOARD_COLUMNS.indexOf(to) > i && i + 1 < BOARD_COLUMNS.length)
    return { reason: "oneStep", next: BOARD_COLUMNS[i + 1]! };
  return { reason: "noWayBack" };
}
