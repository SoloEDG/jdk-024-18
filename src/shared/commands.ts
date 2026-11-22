import type { BaitId, SpotId, StudyCriteria } from "./types";
export type Command =
  | { type: "spot"; id: SpotId }
  | { type: "bait"; id: BaitId }
  | { type: "power"; value: number }
  | { type: "drag"; value: number }
  | { type: "charge-start" }
  | { type: "cast" }
  | { type: "strike" }
  | { type: "reel"; held: boolean }
  | { type: "tick"; dt: number }
  | { type: "next" }
  | { type: "retrieve" }
  | { type: "release"; id: string }
  | { type: "claim"; id: string }
  | { type: "resupply" }
  | { type: "study"; patch: Partial<StudyCriteria> }
  | { type: "journal-policy"; policy: "coarse-new" | "compress-oldest" }
  | { type: "compress-range"; from: number; to: number };
