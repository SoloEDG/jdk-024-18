export type SpotId = "reed" | "brook" | "deep";
export type BaitId = "worm" | "corn" | "fly";
export type FishId = "crucian" | "perch" | "carp" | "trout" | "bass" | "pike";
export type Phase =
  "ready" | "charging" | "waiting" | "bite" | "fighting" | "landed" | "escaped";
export interface FishSpecies {
  id: FishId;
  name: string;
  latin: string;
  color: string;
  rarity: string;
  min: number;
  max: number;
  strength: number;
  waters: SpotId[];
  baits: BaitId[];
  note: string;
}
export interface Catch {
  id: string;
  fish: FishId;
  weight: number;
  spot: SpotId;
  bait: BaitId;
  time: number;
  duration: number;
  peakTension: number;
}
export interface JournalEntry {
  count: number;
  best: number;
  first: number;
}
/**
 * A settled capture fact. `legacy` counts come from the old v1 journal and
 * carry no wait / bite / sequence evidence.
 */
export interface FishFact {
  count: number;
  best: number;
  first: number;
  legacy: number;
}
export type ObservationOutcome = "landed" | "lost" | "missed" | "retrieved";
/** A full-precision observation fragment. */
export interface FineObservation {
  kind: "fine";
  id: string;
  spot: SpotId;
  bait: BaitId;
  castAt: number;
  endAt: number;
  waitMs: number;
  outcome: ObservationOutcome;
  fish?: FishId;
  weight?: number;
}
/** A deliberately compressed observation group; exact times and order are gone. */
export interface CoarseObservation {
  kind: "coarse";
  id: string;
  dayStart: number;
  dayEnd: number;
  spot: SpotId;
  bait: BaitId;
  outcome: ObservationOutcome;
  waitBucket: number;
  waitMinMs: number;
  waitMaxMs: number;
  fish?: FishId;
  count: number;
}
export type Observation = FineObservation | CoarseObservation;
export interface StudyCriteria {
  start: number | null;
  end: number | null;
  waitMinMs: number | null;
  waitMaxMs: number | null;
  baitSequence: BaitId[];
}
export type JournalPolicy = "coarse-new" | "compress-oldest";
export interface GameDocument {
  version: 2;
  spot: SpotId;
  bait: BaitId;
  power: number;
  drag: number;
  seed: number;
  stock: Record<BaitId, number>;
  bag: Catch[];
  facts: Partial<Record<FishId, FishFact>>;
  observations: FineObservation[];
  coarse: CoarseObservation[];
  study: StudyCriteria;
  journalPolicy: JournalPolicy;
  stats: { casts: number; catches: number; escapes: number; released: number };
  claimed: string[];
}
export interface Session {
  id: string;
  phase: Phase;
  clock: number;
  charge: number;
  castPower: number;
  spot: SpotId;
  bait: BaitId;
  fish: FishId | null;
  weight: number;
  castAt: number;
  biteAt: number;
  progress: number;
  tension: number;
  energy: number;
  slackTime: number;
  overload: number;
  peak: number;
  reeling: boolean;
  duration: number;
  message: string;
}
/** The v1 document only ever stored counts and best weights. */
export interface GameDocumentV1 {
  version: 1;
  spot: SpotId;
  bait: BaitId;
  power: number;
  drag: number;
  seed: number;
  stock: Record<BaitId, number>;
  bag: Catch[];
  journal: Partial<Record<FishId, { count: number; best: number; first: number }>>;
  stats: { casts: number; catches: number; escapes: number; released: number };
  claimed: string[];
}
export interface Workspace {
  doc: GameDocument;
  session: Session;
  notice: string;
}
