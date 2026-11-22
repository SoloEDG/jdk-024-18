import type { ObservationOutcome, BaitId, SpotId } from "../../../shared/types";
import { baits } from "../../tackle/model/baits";
import { water } from "../../waters/model/waters";

export const outcomeLabel: Record<ObservationOutcome, string> = {
  landed: "捕获",
  lost: "脱钩",
  missed: "错过咬钩",
  retrieved: "提前收竿",
};

export const outcomeTone: Record<ObservationOutcome, string> = {
  landed: "landed",
  lost: "lost",
  missed: "missed",
  retrieved: "retrieved",
};

export function baitName(id: BaitId) {
  return baits.find((b) => b.id === id)?.name ?? id;
}

export function spotName(id: SpotId) {
  return water(id).name;
}

export function formatClock(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDay(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDateTimeLocal(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeLocal(value: string): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

/** Express a coarse wait bucket without implying more precision than it has. */
export function coarseWaitLabel(minMs: number, maxMs: number) {
  const lo = minMs / 1000;
  const hi = maxMs / 1000;
  return `${lo.toFixed(0)}–${hi.toFixed(0)} 秒桶`;
}
