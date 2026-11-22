import { PackageOpen, RefreshCw, Check, Sparkles } from "lucide-react";
import type { GameDocument } from "../../../shared/types";
import type { Command } from "../../../shared/commands";
import { baits } from "../model/baits";
import { computeStudy, recommendBait } from "../../journal/lib/study";
import { formatPercent, formatRange } from "../../journal/lib/statistics";

export function BaitPanel({
  doc,
  busy,
  send,
}: {
  doc: GameDocument;
  busy: boolean;
  send: (c: Command) => void;
}) {
  const result = computeStudy(doc);
  const recommended = recommendBait(result, doc.spot);
  return (
    <section className="bait-panel">
      <div className="section-title">
        <PackageOpen size={17} />
        <h2>鱼饵盒</h2>
        <button
          className="text-btn"
          disabled={busy}
          onClick={() => send({ type: "resupply" })}
        >
          <RefreshCw size={12} />
          补给
        </button>
      </div>
      <div className="bait-list">
        {baits.map((b) => {
          const stat = (result.baitsBySpot[doc.spot] ?? []).find(
            (s) => s.bait === b.id,
          );
          return (
            <button
              key={b.id}
              disabled={busy || !doc.stock[b.id]}
              onClick={() => send({ type: "bait", id: b.id })}
              className={"bait-card " + (doc.bait === b.id ? "active" : "")}
            >
              <span className="bait-icon" style={{ color: b.color }}>
                {b.icon}
              </span>
              <span>
                <strong>
                  {b.name}
                  {recommended?.bait === b.id && (
                    <em className="bait-rec-badge">
                      <Sparkles size={9} /> 当前推荐
                    </em>
                  )}
                </strong>
                <small>
                  {stat && stat.effectiveN > 0
                    ? stat.bites <= 0
                      ? "本点出现过，但还没有咬钩记录"
                      : `本点咬钩 ${formatPercent(stat.rate)}（${formatRange(
                          stat.low,
                          stat.high,
                        )}${stat.lowSample ? " · 低样本猜测" : ""}）`
                    : "本点尚无观察样本"}
                </small>
              </span>
              <span className="stock">
                ×{doc.stock[b.id]}
                {doc.bait === b.id && <Check size={13} />}
              </span>
            </button>
          );
        })}
      </div>
      <p className="bait-hint">
        {recommended
          ? `依当前研究条件的观察记录，这里更值得先试：${
              baits.find((b) => b.id === recommended.bait)?.name
            }（n≈${recommended.n.toFixed(1)}）${
              recommended.lowSample ? "。样本少，只算猜测。" : "。"
            }`
          : "这个钓点还没有足够观察，无法推荐鱼饵。"}
      </p>
    </section>
  );
}
