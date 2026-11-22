import type { Workspace, ObservationOutcome } from "../shared/types";
import type { Command } from "../shared/commands";
import { idleSession, isBusy } from "../shared/initial";
import { selectWater } from "../features/waters";
import {
  chooseBait,
  tune,
  consumeBait,
  resupply,
  attraction,
  biteDelay,
} from "../features/tackle";
import { prepareCast, tickSession, strike } from "../features/fishing";
import { landCatch, releaseCatch } from "../features/collection";
import { claimReward } from "../features/challenges";
import { compressRange, recordObservation } from "../features/journal";
function record(
  doc: Workspace["doc"],
  session: Workspace["session"],
  outcome: ObservationOutcome,
) {
  return recordObservation(doc, session, outcome, Date.now());
}
export function gameReducer(state: Workspace, c: Command): Workspace {
  const { doc, session: s } = state;
  const busy = isBusy(s);
  switch (c.type) {
    case "spot":
      return busy ? state : { ...state, doc: selectWater(doc, c.id) };
    case "bait":
      return busy ? state : { ...state, doc: chooseBait(doc, c.id) };
    case "power":
      return { ...state, doc: tune(doc, "power", c.value) };
    case "drag":
      return busy ? state : { ...state, doc: tune(doc, "drag", c.value) };
    case "resupply":
      return busy
        ? state
        : {
            ...state,
            doc: resupply(doc),
            notice: "鱼饵已补给，带上好心情出发。",
          };
    case "charge-start":
      return s.phase === "ready" && doc.stock[doc.bait] > 0
        ? {
            ...state,
            session: {
              ...idleSession(),
              phase: "charging",
              message: "再次点击，把鱼饵抛向水面。",
            },
          }
        : state;
    case "cast": {
      if (s.phase !== "charging") return state;
      const consumed = consumeBait(doc);
      if (!consumed) return state;
      const cast = prepareCast(
        doc,
        s.charge,
        attraction(doc.spot, doc.bait),
        (r) => biteDelay(doc.bait, r),
        Date.now(),
      );
      return {
        ...state,
        doc: {
          ...consumed,
          seed: cast.seed,
          stats: { ...doc.stats, casts: doc.stats.casts + 1 },
        },
        session: cast.session,
      };
    }
    case "strike":
      return { ...state, session: strike(s) };
    case "reel":
      return s.phase === "fighting"
        ? { ...state, session: { ...s, reeling: c.held } }
        : state;
    case "retrieve": {
      if (s.phase !== "waiting" || !s.castAt) return state;
      const doc2 = record(doc, s, "retrieved");
      return {
        ...state,
        doc: doc2,
        session: {
          ...s,
          phase: "escaped",
          message: "你收回了鱼饵，这一段的等待已记入手记。",
        },
      };
    }
    case "tick": {
      const next = tickSession(s, doc, Math.min(0.1, Math.max(0, c.dt)));
      if (next === s) return state;
      let updated = doc;
      if (next.phase === "landed" && s.phase !== "landed") {
        updated = landCatch(doc, next, Date.now());
        updated = record(updated, next, "landed");
      }
      if (next.phase === "escaped" && s.phase !== "escaped") {
        updated = {
          ...updated,
          stats: { ...doc.stats, escapes: doc.stats.escapes + 1 },
        };
        updated = record(
          updated,
          next,
          s.phase === "bite" ? "missed" : "lost",
        );
      }
      return { ...state, doc: updated, session: next };
    }
    case "next":
      return s.phase === "landed" || s.phase === "escaped"
        ? { ...state, session: idleSession() }
        : state;
    case "release":
      return { ...state, doc: releaseCatch(doc, c.id) };
    case "claim":
      return { ...state, doc: claimReward(doc, c.id) };
    case "study":
      return {
        ...state,
        doc: { ...doc, study: { ...doc.study, ...c.patch } },
      };
    case "journal-policy":
      return { ...state, doc: { ...doc, journalPolicy: c.policy } };
    case "compress-range": {
      const { doc: compressed, moved } = compressRange(doc, c.from, c.to);
      return {
        ...state,
        doc: compressed,
        notice:
          moved > 0
            ? `已把 ${moved} 条精细片段压缩为粗区间，精确时刻与先后顺序不再可用。`
            : "所选时间窗内没有可压缩的精细片段。",
      };
    }
  }
}
