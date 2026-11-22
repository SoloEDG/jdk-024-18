import type { Catch, FishFact, FishId } from "../../../shared/types";

/**
 * Captures are the only thing the old journal ever stored. They become
 * "facts": settled counts with no wait, bite or bait-sequence evidence.
 */
export function recordFact(
  facts: Partial<Record<FishId, FishFact>>,
  item: Catch,
) {
  const old = facts[item.fish];
  return {
    ...facts,
    [item.fish]: {
      count: (old?.count ?? 0) + 1,
      best: Math.max(old?.best ?? 0, item.weight),
      first: old?.first ? Math.min(old.first, item.time) : item.time,
      legacy: old?.legacy ?? 0,
    },
  };
}
