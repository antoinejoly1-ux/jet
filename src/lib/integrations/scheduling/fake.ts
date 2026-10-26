import type { SchedulingAdapter, SchedulingChanges } from "./types";

/**
 * A stand-in vendor for tests and demos: returns whatever it's given. Swap in
 * a real adapter once the operator's scheduling software is chosen.
 */
export class FakeSchedulingAdapter implements SchedulingAdapter {
  readonly provider = "fake";
  calls: (Date | null)[] = [];

  constructor(public data: SchedulingChanges = { flights: [], maintenance: [], blocks: [] }) {}

  async fetchChanges(since: Date | null): Promise<SchedulingChanges> {
    this.calls.push(since);
    return structuredClone(this.data);
  }
}
