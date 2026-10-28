import { describe, expect, it } from "vitest";
import { NEXT_STATUS } from "@/lib/services/maintenance";
import { BOARD_COLUMNS, DRAG_MOVES, dragRefusal } from "@/lib/maintenance-board";

describe("maintenance board drag rules", () => {
  it("moves one column at a time, and back from review", () => {
    expect(dragRefusal("planned", "in_progress")).toBeNull();
    expect(dragRefusal("in_progress", "review")).toBeNull();
    expect(dragRefusal("review", "done")).toBeNull();
    expect(dragRefusal("review", "in_progress")).toBeNull();
  });

  it("refuses jumps, naming the column to go through first", () => {
    expect(dragRefusal("planned", "done")).toEqual({ reason: "oneStep", next: "in_progress" });
    expect(dragRefusal("planned", "review")).toEqual({ reason: "oneStep", next: "in_progress" });
    expect(dragRefusal("in_progress", "done")).toEqual({ reason: "oneStep", next: "review" });
  });

  it("refuses going backwards except review → in progress", () => {
    expect(dragRefusal("in_progress", "planned")).toEqual({ reason: "noWayBack" });
    expect(dragRefusal("review", "planned")).toEqual({ reason: "noWayBack" });
    expect(dragRefusal("done", "review")).toEqual({ reason: "noWayBack" });
  });

  it("keeps four eyes: whoever sent the job to review can't approve it", () => {
    expect(dragRefusal("review", "done", true)).toEqual({ reason: "maintenance_self_review" });
    expect(dragRefusal("review", "in_progress", true)).toBeNull();
  });

  it("only ever asks the service for a transition it allows", () => {
    for (const from of BOARD_COLUMNS) for (const to of DRAG_MOVES[from]) expect(NEXT_STATUS[from]).toContain(to);
  });
});
