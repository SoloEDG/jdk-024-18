export interface WeightedValue {
  value: number;
  weight: number;
}

/** Kish effective sample size: guards against one heavy fragment posing as many. */
export function effectiveSample(weights: number[]) {
  const sum = weights.reduce((n, w) => n + w, 0);
  const sq = weights.reduce((n, w) => n + w * w, 0);
  return sq > 0 ? (sum * sum) / sq : 0;
}

export function wilson(p: number, n: number, z = 1.96) {
  if (n <= 0) return [0, 1] as const;
  const probability = Math.min(1, Math.max(0, p));
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const centre = probability + z2 / (2 * n);
  const spread = z * Math.sqrt((probability * (1 - probability) + z2 / (4 * n)) / n);
  return [
    Math.max(0, (centre - spread) / denominator),
    Math.min(1, (centre + spread) / denominator),
  ] as const;
}

/** Wilson score interval with weighted successes and a Kish effective n. */
export function weightedInterval(
  values: WeightedValue[],
  z = 1.96,
): { rate: number; low: number; high: number; n: number } {
  const weights = values.map((v) => v.weight).filter((w) => w > 0);
  const n = effectiveSample(weights);
  const total = values.reduce((n, v) => n + v.weight, 0);
  if (total <= 0) return { rate: 0, low: 0, high: 1, n: 0 };
  const success = values.reduce((n, v) => n + v.weight * v.value, 0);
  const [low, high] = wilson(success / total, n, z);
  return { rate: success / total, low, high, n };
}

/** Ratio with a Wilson interval whose width uses a quality-weighted n. */
export function ratioInterval(
  success: number,
  total: number,
  qualityWeights: number[],
  z = 1.96,
) {
  const n = effectiveSample(qualityWeights);
  if (total <= 0) return { rate: 0, low: 0, high: 1, n: 0 };
  const rate = Math.min(1, Math.max(0, success / total));
  const [low, high] = wilson(rate, n, z);
  return { rate, low, high, n };
}

/** Weighted proportion of samples belonging to each category. */
export function categoryShares<K extends string>(
  samples: { key: K; weight: number }[],
  z = 1.96,
): { key: K; n: number; share: number; low: number; high: number }[] {
  const keys = [...new Set(samples.map((s) => s.key))];
  const total = samples.reduce((n, s) => n + s.weight, 0);
  return keys
    .map((key) => {
      const own = samples.filter((s) => s.key === key);
      const weights = own.map((s) => s.weight);
      const nEff = effectiveSample(weights);
      const ownWeight = weights.reduce((n, w) => n + w, 0);
      const share = total > 0 ? ownWeight / total : 0;
      const [low, high] = wilson(share, nEff, z);
      return { key, n: nEff, share, low, high };
    })
    .sort((a, b) => b.share - a.share);
}

export function weightedQuantile(
  pairs: { value: number; weight: number }[],
  q: number,
) {
  const sorted = pairs
    .filter((p) => p.weight > 0)
    .sort((a, b) => a.value - b.value);
  const total = sorted.reduce((n, p) => n + p.weight, 0);
  if (total <= 0) return null;
  let acc = 0;
  for (const p of sorted) {
    acc += p.weight;
    if (acc / total >= q) return p.value;
  }
  return sorted[sorted.length - 1].value;
}

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function formatDuration(ms: number) {
  if (ms < 1000) return `${Math.round(ms)} 毫秒`;
  const s = ms / 1000;
  return `${s.toFixed(s < 10 ? 1 : 0)} 秒`;
}

export function formatRange(low: number, high: number, unit = "%") {
  return `${Math.round(low * 100)}–${Math.round(high * 100)}${unit}`;
}
