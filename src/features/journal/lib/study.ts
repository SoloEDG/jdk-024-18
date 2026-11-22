import type {
  BaitId,
  CoarseObservation,
  FineObservation,
  FishId,
  GameDocument,
  Observation,
  ObservationOutcome,
  SpotId,
  StudyCriteria,
} from "../../../shared/types";
import { waters } from "../../waters/model/waters";
import {
  categoryShares,
  effectiveSample,
  ratioInterval,
  weightedInterval,
  weightedQuantile,
} from "./statistics";

export const COMPLETENESS: Record<ObservationOutcome, number> = {
  landed: 1,
  lost: 0.85,
  missed: 0.8,
  retrieved: 0.3,
};

const BITE_OUTCOMES: ObservationOutcome[] = ["landed", "lost", "missed"];
export function isBite(outcome: ObservationOutcome) {
  return BITE_OUTCOMES.includes(outcome);
}

export interface BaitStat {
  bait: BaitId;
  raw: number;
  effectiveN: number;
  bites: number;
  landed: number;
  rate: number;
  low: number;
  high: number;
  lowSample: boolean;
}

export interface SpeciesShare {
  fish: FishId;
  share: number;
  low: number;
  high: number;
  n: number;
}
export interface SpotShare {
  spot: SpotId;
  share: number;
  low: number;
  high: number;
  n: number;
}

export interface SpotStat {
  spot: SpotId;
  raw: number;
  effectiveN: number;
  bites: number;
  rate: number;
  low: number;
  high: number;
  species: SpeciesShare[];
}

export interface WaitStat {
  n: number;
  minMs: number | null;
  medianMs: number | null;
  maxMs: number | null;
  lowMs: number | null;
  highMs: number | null;
  exactCount: number;
  coarseCount: number;
}

export interface FishStat {
  fish: FishId;
  effectiveN: number;
  bites: number;
  landed: number;
  lost: number;
  missed: number;
  wait: WaitStat;
  spots: SpotShare[];
  baits: { bait: BaitId; share: number; low: number; high: number; n: number }[];
  lapseNote: string;
}

export interface StudyResult {
  fineMatched: number;
  coarseMatched: number;
  proratedFine: number;
  bandProrated: number;
  sequenceActive: boolean;
  sequenceMatches: number;
  sequenceCoarseExcluded: number;
  effectiveN: number;
  attempts: number;
  complete: number;
  incomplete: number;
  bites: number;
  missed: number;
  lost: number;
  landed: number;
  exposureMs: number;
  biteRate: { rate: number; low: number; high: number; n: number };
  landingRate: { rate: number; low: number; high: number; n: number };
  completion: { rate: number; low: number; high: number; n: number };
  wait: WaitStat;
  bySpot: SpotStat[];
  byBait: BaitStat[];
  baitsBySpot: Partial<Record<SpotId, BaitStat[]>>;
  byFish: Partial<Record<FishId, FishStat>>;
  hasData: boolean;
}

interface Attempt {
  obs: Observation;
  raw: number;
  eventWeight: number;
  /** Exposure discounted by how completely the cast was observed. */
  attemptWeight: number;

  waitMs: number;
  exact: boolean;
  timeCoverage: number;
  bandCoverage: number;
  outcome: ObservationOutcome;
  fish?: FishId;
  spot: SpotId;
  bait: BaitId;
}

function overlap(a: number, b: number, c: number, d: number) {
  return Math.max(0, Math.min(b, d) - Math.max(a, c));
}

/** Accept either order the player typed, without rewriting their inputs. */
export function studyWindow(study: StudyCriteria) {
  if (study.start === null || study.end === null)
    return { start: study.start ?? -Infinity, end: study.end ?? Infinity };
  return {
    start: Math.min(study.start, study.end),
    end: Math.max(study.start, study.end),
  };
}

export function waitBand(study: StudyCriteria) {
  if (study.waitMinMs === null || study.waitMaxMs === null)
    return { min: study.waitMinMs ?? 0, max: study.waitMaxMs ?? Infinity };
  return {
    min: Math.min(study.waitMinMs, study.waitMaxMs),
    max: Math.max(study.waitMinMs, study.waitMaxMs),
  };
}

export function normalizeStudy(study: StudyCriteria): StudyCriteria {
  // Never mutate the saved document while rendering a study result.
  return study.baitSequence.length > 6
    ? { ...study, baitSequence: study.baitSequence.slice(0, 6) }
    : study;
}

function sequenceIds(doc: GameDocument, sequence: BaitId[]) {
  if (sequence.length === 0) return null;
  const fines = [...doc.observations].sort((a, b) => a.castAt - b.castAt);
  // A compressed day anywhere between two casts destroys their adjacency claim.
  const blocked = (a: FineObservation, b: FineObservation) =>
    doc.coarse.some(
      (c: CoarseObservation) =>
        c.dayStart <= b.castAt && c.dayEnd > a.castAt,
    );
  const ids = new Set<string>();
  for (let i = 0; i + sequence.length <= fines.length; i++) {
    let ok = true;
    for (let j = 0; j < sequence.length; j++) {
      if (fines[i + j].bait !== sequence[j]) {
        ok = false;
        break;
      }
      if (j > 0 && blocked(fines[i + j - 1], fines[i + j])) {
        ok = false;
        break;
      }
    }
    if (ok)
      for (let j = 0; j < sequence.length; j++) ids.add(fines[i + j].id);
  }
  return ids;
}

function fineSample(
  o: FineObservation,
  study: StudyCriteria,
): Attempt | null {
  if (o.waitMs <= 0) return null;
  const win = studyWindow(study);
  const spanStart = o.castAt;
  const spanEnd = o.castAt + o.waitMs;
  const timeCoverage = overlap(spanStart, spanEnd, win.start, win.end) / o.waitMs;
  if (timeCoverage <= 0) return null;
  const band = waitBand(study);
  // Exact fragments either sit in the requested wait band or they do not.
  if (o.waitMs < band.min || o.waitMs > band.max) return null;
  return {
    obs: o,
    raw: 1,
    eventWeight: timeCoverage,
    attemptWeight: timeCoverage * COMPLETENESS[o.outcome],
    waitMs: o.waitMs,
    exact: true,
    timeCoverage,
    bandCoverage: 1,
    outcome: o.outcome,
    fish: o.fish,
    spot: o.spot,
    bait: o.bait,
  };
}

function coarseSample(
  c: CoarseObservation,
  study: StudyCriteria,
): Attempt | null {
  const dayLength = c.dayEnd - c.dayStart;
  if (dayLength <= 0) return null;
  const win = studyWindow(study);
  const timeCoverage =
    overlap(c.dayStart, c.dayEnd, win.start, win.end) / dayLength;
  if (timeCoverage <= 0) return null;
  const band = waitBand(study);
  const bucketWidth = c.waitMaxMs - c.waitMinMs;
  if (bucketWidth <= 0) return null;
  const bandCoverage =
    overlap(c.waitMinMs, c.waitMaxMs, band.min, band.max) / bucketWidth;
  if (bandCoverage <= 0) return null;
  return {
    obs: c,
    raw: c.count,
    eventWeight: c.count * timeCoverage * bandCoverage,
    attemptWeight:
      c.count * timeCoverage * bandCoverage * COMPLETENESS[c.outcome],
    waitMs: (c.waitMinMs + c.waitMaxMs) / 2,
    exact: false,
    timeCoverage,
    bandCoverage,
    outcome: c.outcome,
    fish: c.fish,
    spot: c.spot,
    bait: c.bait,
  };
}

function waitStat(samples: Attempt[]): WaitStat {
  const pairs = samples
    .filter((s) => isBite(s.outcome))
    .map((s) => ({ value: s.waitMs, weight: s.eventWeight }));
  const exact = samples.filter((s) => isBite(s.outcome) && s.exact).length;
  const coarse = samples.filter((s) => isBite(s.outcome) && !s.exact).length;
  return {
    n: effectiveSample(pairs.map((p) => p.weight)),
    minMs: weightedQuantile(pairs, 0),
    medianMs: weightedQuantile(pairs, 0.5),
    maxMs: weightedQuantile(pairs, 1),
    lowMs: weightedQuantile(pairs, 0.25),
    highMs: weightedQuantile(pairs, 0.75),
    exactCount: exact,
    coarseCount: coarse,
  };
}

function speciesShares(samples: Attempt[]): SpeciesShare[] {
  return categoryShares(
    samples
      .filter((s) => s.fish)
      .map((s) => ({ key: s.fish as FishId, weight: s.eventWeight })),
  ).map((s) => ({
    fish: s.key,
    share: s.share,
    low: s.low,
    high: s.high,
    n: s.n,
  }));
}

function baitStats(samples: Attempt[]): BaitStat[] {
  const baits = [...new Set(samples.map((s) => s.bait))];
  return baits
    .map((bait) => {
      const own = samples.filter((s) => s.bait === bait);
      const interval = weightedInterval(
        own.map((s) => ({
          value: isBite(s.outcome) ? 1 : 0,
          weight: s.attemptWeight,
        })),
      );
      return {
        bait,
        raw: own.reduce((n, s) => n + s.raw, 0),
        effectiveN: interval.n,
        bites: own
          .filter((s) => isBite(s.outcome))
          .reduce((n, s) => n + s.eventWeight, 0),
        landed: own
          .filter((s) => s.outcome === "landed")
          .reduce((n, s) => n + s.eventWeight, 0),
        rate: interval.rate,
        low: interval.low,
        high: interval.high,
        lowSample: interval.n < 5,
      };
    })
    .sort((a, b) => b.rate - a.rate || b.effectiveN - a.effectiveN);
}

function fishStats(samples: Attempt[]): Partial<Record<FishId, FishStat>> {
  const result: Partial<Record<FishId, FishStat>> = {};
  const bites = samples.filter((s) => isBite(s.outcome) && s.fish);
  const fishIds = [...new Set(bites.map((s) => s.fish as FishId))];
  for (const fish of fishIds) {
    const own = bites.filter((s) => s.fish === fish);
    const weights = own.map((s) => s.eventWeight);
    const lapse =
      own.filter((s) => s.outcome === "lost").reduce((n, s) => n + s.eventWeight, 0) /
      Math.max(1, weights.reduce((n, w) => n + w, 0));
    const spots = categoryShares(
      own.map((s) => ({ key: s.spot, weight: s.eventWeight })),
    ).map((s) => ({
      spot: s.key,
      share: s.share,
      low: s.low,
      high: s.high,
      n: s.n,
    }));
    result[fish] = {
      fish,
      effectiveN: effectiveSample(weights),
      bites: weights.reduce((n, w) => n + w, 0),
      landed: own
        .filter((s) => s.outcome === "landed")
        .reduce((n, s) => n + s.eventWeight, 0),
      lost: own
        .filter((s) => s.outcome === "lost")
        .reduce((n, s) => n + s.eventWeight, 0),
      missed: own
        .filter((s) => s.outcome === "missed")
        .reduce((n, s) => n + s.eventWeight, 0),
      wait: waitStat(own),
      spots,
      baits: categoryShares(
        own.map((s) => ({ key: s.bait, weight: s.eventWeight })),
      ).map((s) => ({
        bait: s.key,
        share: s.share,
        low: s.low,
        high: s.high,
        n: s.n,
      })),
      lapseNote:
        lapse > 0.4
          ? "脱钩比例偏高，建议放低收线力度或调高泄力。"
          : "脱钩比例未见明显偏高。",
    };
  }
  return result;
}

export function computeStudy(doc: GameDocument): StudyResult {
  const study = normalizeStudy(doc.study);
  const seq = sequenceIds(doc, study.baitSequence);
  const attempts: Attempt[] = [];
  let fineMatched = 0;
  let coarseMatched = 0;
  let sequenceMatches = 0;

  for (const o of doc.observations) {
    if (seq && !seq.has(o.id)) continue;
    const sample = fineSample(o, study);
    if (!sample) continue;
    fineMatched += 1;
    if (seq) sequenceMatches += 1;
    attempts.push(sample);
  }
  for (const c of doc.coarse) {
    if (seq) continue;
    const sample = coarseSample(c, study);
    if (!sample) continue;
    coarseMatched += 1;
    attempts.push(sample);
  }

  const attemptWeights = attempts.map((s) => s.attemptWeight);
  const effectiveN = effectiveSample(attemptWeights);
  const bite = (o: ObservationOutcome) => isBite(o);
  const eventSum = (pred: (s: Attempt) => boolean) =>
    attempts.filter(pred).reduce((n, s) => n + s.eventWeight, 0);

  // A bite is a full event; an early retrieve is censored exposure and is
  // discounted rather than silently treated as a complete non-bite.
  const biteSuccess = attempts
    .filter((s) => bite(s.outcome))
    .reduce((n, s) => n + s.eventWeight, 0);
  const biteExposure =
    biteSuccess +
    attempts
      .filter((s) => s.outcome === "retrieved")
      .reduce((n, s) => n + s.eventWeight * COMPLETENESS.retrieved, 0);
  const biteInterval = ratioInterval(
    biteSuccess,
    biteExposure,
    attempts.map((s) => s.attemptWeight),
  );
  // Landing rate is conditional on actually hooking a fish.
  const hooked = attempts.filter(
    (s) => s.outcome === "landed" || s.outcome === "lost",
  );
  const landedWeight = hooked
    .filter((s) => s.outcome === "landed")
    .reduce((n, s) => n + s.eventWeight, 0);
  const hookWeight = hooked.reduce((n, s) => n + s.eventWeight, 0);
  const landingInterval = ratioInterval(
    landedWeight,
    hookWeight,
    hooked.map((s) => s.attemptWeight),
  );
  const completeWeight = attempts
    .filter((s) => s.outcome === "landed" || s.outcome === "lost")
    .reduce((n, s) => n + s.eventWeight, 0);
  const totalAttemptWeight = attempts.reduce((n, s) => n + s.eventWeight, 0);
  const completionInterval = ratioInterval(
    completeWeight,
    totalAttemptWeight,
    attempts.map((s) => s.attemptWeight),
  );

  const spots = [...new Set(attempts.map((s) => s.spot))].map((spot) => {
    const own = attempts.filter((s) => s.spot === spot);
    const interval = weightedInterval(
      own.map((s) => ({
        value: bite(s.outcome) ? 1 : 0,
        weight: s.attemptWeight,
      })),
    );
    return {
      spot,
      raw: own.reduce((n, s) => n + s.raw, 0),
      effectiveN: interval.n,
      bites: own
        .filter((s) => bite(s.outcome))
        .reduce((n, s) => n + s.eventWeight, 0),
      rate: interval.rate,
      low: interval.low,
      high: interval.high,
      species: speciesShares(own.filter((s) => bite(s.outcome))),
    };
  });

  const bySpot = spots.sort((a, b) => b.bites - a.bites);
  const baitsBySpot: Partial<Record<SpotId, BaitStat[]>> = {};
  for (const spot of waters.map((w) => w.id)) {
    const own = attempts.filter((s) => s.spot === spot);
    baitsBySpot[spot] = baitStats(own);
  }

  return {
    fineMatched,
    coarseMatched,
    proratedFine: attempts.filter((s) => s.exact && s.timeCoverage < 0.999)
      .length,
    bandProrated: attempts.filter((s) => !s.exact && s.bandCoverage < 0.999).length,
    sequenceActive: !!seq,
    sequenceMatches,
    sequenceCoarseExcluded: seq ? doc.coarse.length : 0,
    effectiveN,
    attempts: attempts.reduce((n, s) => n + s.raw, 0),
    complete: eventSum(
      (s) => s.outcome === "landed" || s.outcome === "lost",
    ),
    incomplete: eventSum(
      (s) => s.outcome === "missed" || s.outcome === "retrieved",
    ),
    bites: eventSum((s) => bite(s.outcome)),
    missed: eventSum((s) => s.outcome === "missed"),
    lost: eventSum((s) => s.outcome === "lost"),
    landed: eventSum((s) => s.outcome === "landed"),
    exposureMs: attempts.reduce((n, s) => n + s.eventWeight * s.waitMs, 0),
    biteRate: biteInterval,
    landingRate: landingInterval,
    completion: completionInterval,
    wait: waitStat(attempts),
    bySpot,
    byBait: baitStats(attempts),
    baitsBySpot,
    byFish: fishStats(attempts),
    hasData: attempts.length > 0,
  };
}

export interface BaitRecommendation {
  bait: BaitId;
  rate: number;
  low: number;
  high: number;
  n: number;
  lowSample: boolean;
}

/** Recommendations come only from recorded observations, never the species table. */
export function recommendBait(
  result: StudyResult,
  spot: SpotId,
): BaitRecommendation | null {
  const list = (result.baitsBySpot[spot] ?? []).filter((b) => b.effectiveN > 0);
  if (list.length === 0) return null;
  const best = [...list].sort(
    (a, b) => b.rate - a.rate || b.effectiveN - a.effectiveN,
  )[0];
  if (best.bites <= 0) return null;
  return {
    bait: best.bait,
    rate: best.rate,
    low: best.low,
    high: best.high,
    n: best.effectiveN,
    lowSample: best.effectiveN < 5,
  };
}


/** Fine fragments that the current study criteria actually use (for UI marks). */
export function matchedFineIds(doc: GameDocument) {
  const study = normalizeStudy(doc.study);
  const seq = sequenceIds(doc, study.baitSequence);
  const ids = new Set<string>();
  for (const o of doc.observations) {
    if (seq && !seq.has(o.id)) continue;
    if (fineSample(o, study)) ids.add(o.id);
  }
  return ids;
}
