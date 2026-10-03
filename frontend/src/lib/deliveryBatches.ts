/** Split an allocation into equal delivery batches, highest-risk counties
 * first. A scheduling heuristic, not an optimisation: the optimiser decides
 * *how many* doses each county gets; this only orders shipments so the
 * riskiest counties are fully supplied soonest. A county whose doses don't
 * fit in one batch spills over into the next (unless only a sliver is left,
 * which ships with the rest). */
export interface BatchInput {
  code: string;
  name: string;
  doses: number;
  risk: number;
}

export interface Batch {
  index: number; // 0-based
  items: { code: string; name: string; doses: number }[];
  total: number;
}

const SLIVER = 0.05;

export function deliveryBatches(allocations: BatchInput[], batchCount: number): Batch[] {
  const funded = allocations.filter((a) => a.doses > 0).sort((a, b) => b.risk - a.risk || b.doses - a.doses);
  const total = funded.reduce((n, a) => n + a.doses, 0);
  const count = Math.max(1, Math.floor(batchCount));
  if (total === 0) return [];
  const size = Math.ceil(total / count);

  const batches: Batch[] = Array.from({ length: count }, (_, index) => ({ index, items: [], total: 0 }));
  let b = 0;
  for (const a of funded) {
    let left = a.doses;
    while (left > 0) {
      const batch = batches[b];
      const room = size - batch.total;
      // Don't strand a sliver (under 5% of a batch) of a county in the next
      // batch — ship it now, letting this batch run slightly over.
      const take = b === count - 1 || left - room < size * SLIVER ? left : Math.min(left, room);
      if (take > 0) {
        batch.items.push({ code: a.code, name: a.name, doses: take });
        batch.total += take;
        left -= take;
      }
      if (batch.total >= size && b < count - 1) b++;
    }
  }
  return batches.filter((x) => x.total > 0);
}

/** Batch (0-based) in which each county's last doses arrive. */
export function completionBatch(batches: Batch[]): Map<string, number> {
  const done = new Map<string, number>();
  for (const batch of batches) for (const item of batch.items) done.set(item.code, batch.index);
  return done;
}
