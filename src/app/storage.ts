import { newDocument, defaultStudy } from "../shared/initial";
import { fishCatalog } from "../shared/catalog";
import type {
  GameDocument,
  FineObservation,
  CoarseObservation,
  FishFact,
  GameDocumentV1,
} from "../shared/types";
const key = "stillwater-jdk024-v2";
const legacyKey = "stillwater-jdk024-v1";
const spots = ["reed", "brook", "deep"];
const baits = ["worm", "corn", "fly"];
const outcomes = ["landed", "lost", "missed", "retrieved"];
const fishIds = fishCatalog.map((f) => f.id);

function validFact(value: unknown): value is FishFact {
  if (!value || typeof value !== "object") return false;
  const f = value as FishFact;
  return (
    Number.isInteger(f.count) &&
    f.count > 0 &&
    Number.isFinite(f.best) &&
    Number.isFinite(f.first) &&
    Number.isInteger(f.legacy) &&
    f.legacy >= 0
  );
}

function validObs(value: unknown): value is FineObservation {
  if (!value || typeof value !== "object") return false;
  const o = value as FineObservation;
  return (
    o.kind === "fine" &&
    typeof o.id === "string" &&
    spots.includes(o.spot) &&
    baits.includes(o.bait) &&
    [o.castAt, o.endAt, o.waitMs].every(Number.isFinite) &&
    o.waitMs >= 0 &&
    outcomes.includes(o.outcome) &&
    (o.fish === undefined || fishIds.includes(o.fish)) &&
    (o.weight === undefined || Number.isFinite(o.weight))
  );
}

function validCoarse(value: unknown): value is CoarseObservation {
  if (!value || typeof value !== "object") return false;
  const c = value as CoarseObservation;
  return (
    c.kind === "coarse" &&
    typeof c.id === "string" &&
    spots.includes(c.spot) &&
    baits.includes(c.bait) &&
    [c.dayStart, c.dayEnd, c.waitBucket, c.waitMinMs, c.waitMaxMs].every(
      Number.isFinite,
    ) &&
    Number.isInteger(c.count) &&
    c.count > 0 &&
    outcomes.includes(c.outcome) &&
    (c.fish === undefined || fishIds.includes(c.fish))
  );
}

function valid(value: unknown): value is GameDocument {
  if (!value || typeof value !== "object") return false;
  const d = value as GameDocument;
  return (
    d.version === 2 &&
    spots.includes(d.spot) &&
    baits.includes(d.bait) &&
    Number.isFinite(d.power) &&
    d.power >= 0.15 &&
    d.power <= 0.95 &&
    Number.isFinite(d.drag) &&
    d.drag >= 0.15 &&
    d.drag <= 0.95 &&
    Number.isInteger(d.seed) &&
    !!d.stock &&
    baits.every(
      (b) =>
        Number.isInteger(d.stock[b as keyof typeof d.stock]) &&
        d.stock[b as keyof typeof d.stock] >= 0,
    ) &&
    !!d.stats &&
    ["casts", "catches", "escapes", "released"].every(
      (k) =>
        Number.isInteger(d.stats[k as keyof typeof d.stats]) &&
        d.stats[k as keyof typeof d.stats] >= 0,
    ) &&
    Array.isArray(d.claimed) &&
    d.claimed.every((c) => typeof c === "string") &&
    Array.isArray(d.bag) &&
    d.bag.every(
      (c) =>
        c &&
        typeof c.id === "string" &&
        fishIds.includes(c.fish) &&
        spots.includes(c.spot) &&
        baits.includes(c.bait) &&
        [c.weight, c.time, c.duration, c.peakTension].every(Number.isFinite),
    ) &&
    !!d.facts &&
    Object.entries(d.facts).every(
      ([id, e]) => fishIds.includes(id as (typeof fishIds)[number]) && validFact(e),
    ) &&
    Array.isArray(d.observations) &&
    d.observations.every(validObs) &&
    Array.isArray(d.coarse) &&
    d.coarse.every(validCoarse) &&
    !!d.study &&
    (d.study.start === null || Number.isFinite(d.study.start)) &&
    (d.study.end === null || Number.isFinite(d.study.end)) &&
    (d.study.waitMinMs === null || Number.isFinite(d.study.waitMinMs)) &&
    (d.study.waitMaxMs === null || Number.isFinite(d.study.waitMaxMs)) &&
    Array.isArray(d.study.baitSequence) &&
    d.study.baitSequence.every((b) => baits.includes(b)) &&
    (d.journalPolicy === "coarse-new" || d.journalPolicy === "compress-oldest")
  );
}

function isLegacy(value: unknown): value is GameDocumentV1 {
  if (!value || typeof value !== "object") return false;
  const d = value as GameDocumentV1;
  return (
    d.version === 1 &&
    !!d.journal &&
    Array.isArray(d.bag) &&
    !!d.stats &&
    !!d.stock
  );
}

/**
 * Old captures can only become facts. The old journal never stored wait,
 * bite or sequence evidence, so no observation fragments are invented.
 */
function migrateLegacy(old: GameDocumentV1): GameDocument {
  const base = newDocument();
  const migrated: GameDocument["facts"] = {};
  for (const [id, entry] of Object.entries(old.journal)) {
    if (!fishIds.includes(id as (typeof fishIds)[number]) || !entry) continue;
    const count =
      Number.isInteger(entry.count) && entry.count > 0 ? entry.count : 0;
    if (count === 0 || !Number.isFinite(entry.best)) continue;
    migrated[id as (typeof fishIds)[number]] = {
      count,
      best: entry.best,
      first: Number.isFinite(entry.first) ? entry.first : Date.now(),
      legacy: count,
    };
  }
  return {
    ...base,
    spot: spots.includes(old.spot) ? old.spot : base.spot,
    bait: baits.includes(old.bait) ? old.bait : base.bait,
    power: Number.isFinite(old.power) ? old.power : base.power,
    drag: Number.isFinite(old.drag) ? old.drag : base.drag,
    seed: Number.isInteger(old.seed) ? old.seed : base.seed,
    stock: {
      worm: Math.max(0, old.stock?.worm ?? base.stock.worm),
      corn: Math.max(0, old.stock?.corn ?? base.stock.corn),
      fly: Math.max(0, old.stock?.fly ?? base.stock.fly),
    },
    bag: old.bag.filter(
      (c) =>
        c &&
        typeof c.id === "string" &&
        fishIds.includes(c.fish) &&
        spots.includes(c.spot) &&
        baits.includes(c.bait) &&
        Number.isFinite(c.weight) &&
        Number.isFinite(c.time),
    ),
    facts: migrated,
    stats: {
      casts: old.stats?.casts ?? 0,
      catches: old.stats?.catches ?? 0,
      escapes: old.stats?.escapes ?? 0,
      released: old.stats?.released ?? 0,
    },
    claimed: Array.isArray(old.claimed) ? old.claimed : [],
    observations: [],
    coarse: [],
    study: defaultStudy(),
    journalPolicy: "coarse-new",
  };
}

export function loadGame(): {
  doc: GameDocument;
  notice: string;
  recovery?: true;
} {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (valid(parsed)) return { doc: parsed, notice: "" };
      return {
        doc: newDocument(),
        notice: "本地手记格式或版本无法读取，已保留原手记并开启临时游玩。",
        recovery: true,
      };
    }
    const legacyRaw = localStorage.getItem(legacyKey);
    if (legacyRaw) {
      const parsed: unknown = JSON.parse(legacyRaw);
      if (isLegacy(parsed))
        return {
          doc: migrateLegacy(parsed),
          notice: "旧手记的捕获已迁入事实记录；旧记录没有等待与咬钩细节，无法还原为观察片段。",
        };
      return {
        doc: newDocument(),
        notice: "旧手记格式无法读取，已开启新的观察手记。",
        recovery: true,
      };
    }
    return { doc: newDocument(), notice: "" };
  } catch {
    return {
      doc: newDocument(),
      notice: "无法读取本地手记，已暂停自动保存，本次可以临时游玩。",
      recovery: true,
    };
  }
}
export function saveGame(doc: GameDocument) {
  try {
    localStorage.setItem(key, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}
