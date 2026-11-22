import { fishCatalog } from "../../../shared/catalog";
import type { GameDocument, SpotId } from "../../../shared/types";
import { water } from "../model/waters";
/** Simulation-side spawn table. Never render this directly. */
export function availableFish(spot: SpotId) {
  return fishCatalog.filter((f) => f.waters.includes(spot));
}
export function canVisit(doc: GameDocument, spot: SpotId) {
  return doc.stats.catches >= water(spot).catchesRequired;
}
