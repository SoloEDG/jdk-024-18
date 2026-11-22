import type {
  BaitId,
  CoarseObservation,
  FineObservation,
  FishId,
  GameDocument,
  ObservationOutcome,
  Session,
  SpotId,
} from "../../../shared/types";
import { MAX_FINE_OBSERVATIONS } from "../../../shared/initial";

export const WAIT_BUCKET_MS = 1000;

export function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function waitBucket(waitMs: number) {
  return Math.max(0, Math.floor(waitMs / WAIT_BUCKET_MS));
}

export function bucketRange(bucket: number) {
  return { min: bucket * WAIT_BUCKET_MS, max: (bucket + 1) * WAIT_BUCKET_MS };
}

function groupKey(
  obs: {
    spot: SpotId;
    bait: BaitId;
    outcome: ObservationOutcome;
    fish?: FishId;
  },
  dayStart: number,
  bucket: number,
) {
  return [
    dayStart,
    obs.spot,
    obs.bait,
    obs.outcome,
    bucket,
    obs.fish ?? "-",
  ].join("|");
}

function toCoarse(
  obs: FineObservation[],
  dayStart: number,
): CoarseObservation[] {
  const groups = new Map<string, CoarseObservation>();
  for (const o of obs) {
    const bucket = waitBucket(o.waitMs);
    const key = groupKey(o, dayStart, bucket);
    const existing = groups.get(key);
    const range = bucketRange(bucket);
    if (existing) {
      existing.count += 1;
      existing.fish = existing.fish ?? o.fish;
    } else {
      groups.set(key, {
        kind: "coarse",
        id: `c-${key}`,
        dayStart,
        dayEnd: dayStart + 24 * 3600 * 1000,
        spot: o.spot,
        bait: o.bait,
        outcome: o.outcome,
        waitBucket: bucket,
        waitMinMs: range.min,
        waitMaxMs: range.max,
        fish: o.fish,
        count: 1,
      });
    }
  }
  return [...groups.values()];
}

function compressFines(
  doc: GameDocument,
  predicate: (o: FineObservation) => boolean,
): { fine: FineObservation[]; coarse: CoarseObservation[]; moved: number } {
  const keep: FineObservation[] = [];
  const byDay = new Map<number, FineObservation[]>();
  for (const o of doc.observations) {
    if (!predicate(o)) {
      keep.push(o);
      continue;
    }
    const day = startOfDay(o.castAt);
    const list = byDay.get(day) ?? [];
    list.push(o);
    byDay.set(day, list);
  }
  const merged = new Map<string, CoarseObservation>();
  const keepCoarse: CoarseObservation[] = [];
  for (const c of doc.coarse) {
    const old = merged.get(c.id);
    if (old) {
      old.count += c.count;
      old.fish = old.fish ?? c.fish;
    } else {
      const clone = { ...c };
      merged.set(clone.id, clone);
    }
  }
  for (const [day, list] of byDay) {
    for (const group of toCoarse(list, day)) {
      const old = merged.get(group.id);
      if (old) {
        old.count += group.count;
        old.fish = old.fish ?? group.fish;
      } else merged.set(group.id, group);
    }
  }
  for (const c of merged.values()) keepCoarse.push(c);
  return { fine: keep, coarse: keepCoarse, moved: doc.observations.length - keep.length };
}

/** Explicitly compress every fine fragment whose cast started in [from, to). */
export function compressRange(doc: GameDocument, from: number, to: number) {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const { fine, coarse, moved } = compressFines(
    doc,
    (o) => o.castAt >= lo && o.castAt < hi,
  );
  return moved > 0
    ? { doc: { ...doc, observations: fine, coarse }, moved }
    : { doc, moved: 0 };
}

/**
 * Policy used when the fine-fragment space is full: compress roughly the
 * oldest quarter of fragments, grouped by day. Only the oldest windows lose
 * precision; the rest of the notebook stays re-researchable.
 */
export function makeRoom(doc: GameDocument) {
  if (doc.observations.length < MAX_FINE_OBSERVATIONS) return { doc, moved: 0 };
  if (doc.journalPolicy === "coarse-new") return { doc, moved: 0 };
  const batch = Math.max(1, Math.ceil(MAX_FINE_OBSERVATIONS / 4));
  const victims = new Set(
    [...doc.observations]
      .sort((a, b) => a.castAt - b.castAt)
      .slice(0, batch)
      .map((o) => o.id),
  );
  const { fine, coarse, moved } = compressFines(doc, (o) =>
    victims.has(o.id),
  );
  return moved > 0
    ? { doc: { ...doc, observations: fine, coarse }, moved }
    : { doc, moved: 0 };
}

function newFine(
  s: Session,
  outcome: ObservationOutcome,
  waitMs: number,
  now: number,
): FineObservation {
  const fish = outcome === "landed" || outcome === "lost" ? s.fish ?? undefined : undefined;
  return {
    kind: "fine",
    id: `${s.id}:${now}`,
    spot: s.spot,
    bait: s.bait,
    castAt: s.castAt,
    endAt: now,
    waitMs,
    outcome,
    fish,
    weight: outcome === "landed" ? s.weight : undefined,
  };
}

function asCoarse(o: FineObservation): CoarseObservation {
  const bucket = waitBucket(o.waitMs);
  const range = bucketRange(bucket);
  const day = startOfDay(o.castAt);
  return {
    kind: "coarse",
    id: `c-${groupKey(o, day, bucket)}`,
    dayStart: day,
    dayEnd: day + 24 * 3600 * 1000,
    spot: o.spot,
    bait: o.bait,
    outcome: o.outcome,
    waitBucket: bucket,
    waitMinMs: range.min,
    waitMaxMs: range.max,
    fish: o.fish,
    count: 1,
  };
}

/**
 * Append one resolved cast as a fine fragment, or as a deliberately coarse
 * group when fine space is full and the player chose "coarse new".
 */
export function recordObservation(
  doc: GameDocument,
  s: Session,
  outcome: ObservationOutcome,
  now: number,
) {
  if (!s.castAt) return doc;
  // One resolved cast contributes exactly one observation fragment. Phase
  // transitions already guarantee this, but a stale tick must not duplicate it.
  if (doc.observations.some((o) => o.id.startsWith(`${s.id}:`))) return doc;
  const waitMs =
    outcome === "retrieved"
      ? Math.max(0, s.clock) * 1000
      : Math.max(0, s.biteAt) * 1000;
  // Zero-length exposure is not an observation; do not pad the notebook with it.
  if (waitMs <= 0) return doc;
  const fine = newFine(s, outcome, waitMs, now);
  if (doc.observations.length >= MAX_FINE_OBSERVATIONS) {
    if (doc.journalPolicy === "coarse-new") {
      const g = asCoarse(fine);
      const existing = doc.coarse.find((c) => c.id === g.id);
      const coarse = existing
        ? doc.coarse.map((c) =>
            c.id === g.id ? { ...c, count: c.count + 1 } : c,
          )
        : [...doc.coarse, g];
      return { ...doc, coarse };
    }
  }
  const made = makeRoom(doc);
  const base = made.doc;
  if (base.observations.length < MAX_FINE_OBSERVATIONS)
    return { ...base, observations: [...base.observations, fine] };
  const g = asCoarse(fine);
  return { ...base, coarse: [...base.coarse, g] };
}

export function observedSpeciesAt(doc: GameDocument, spot: SpotId) {
  const ids = new Set<FishId>();
  for (const o of doc.observations)
    if (o.spot === spot && o.fish) ids.add(o.fish);
  for (const c of doc.coarse)
    if (c.spot === spot && c.fish) ids.add(c.fish);
  return ids.size;
}
