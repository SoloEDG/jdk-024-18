import { useState } from "react";
import {
  Microscope,
  Timer,
  Fish,
  MapPin,
  AlertTriangle,
  RotateCcw,
  Undo2,
  X,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import type {
  BaitId,
  FishId,
  GameDocument,
  SpotId,
  StudyCriteria,
} from "../../../shared/types";
import type { Command } from "../../../shared/commands";
import { species } from "../../../shared/catalog";
import { baits } from "../../tackle/model/baits";
import { waters } from "../../waters/model/waters";
import { computeStudy, recommendBait } from "../lib/study";
import { formatDuration, formatPercent, formatRange } from "../lib/statistics";
import {
  baitName,
  formatDateTimeLocal,
  fromDateTimeLocal,
  spotName,
} from "../lib/format";

const emptyStudy: StudyCriteria = {
  start: null,
  end: null,
  waitMinMs: null,
  waitMaxMs: null,
  baitSequence: [],
};

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="study-field">
      <span>{label}</span>
      <input
        type="datetime-local"
        value={value === null ? "" : formatDateTimeLocal(value)}
        onChange={(e) => onChange(fromDateTimeLocal(e.target.value))}
      />
    </label>
  );
}

function WaitField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="study-field">
      <span>{label}（秒）</span>
      <input
        type="number"
        min="0"
        step="0.1"
        placeholder="不限"
        value={value === null ? "" : value / 1000}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? null : Math.max(0, +raw * 1000));
        }}
      />
    </label>
  );
}

function ShareRow({
  label,
  share,
  low,
  high,
  n,
  note,
}: {
  label: string;
  share: number;
  low: number;
  high: number;
  n: number;
  note?: string;
}) {
  return (
    <div className="share-row">
      <span>{label}</span>
      <b>{formatPercent(share)}</b>
      <small>
        可信 {formatRange(low, high)} · n≈{n.toFixed(1)}
        {note ? ` · ${note}` : ""}
      </small>
    </div>
  );
}

function FishStudy({ doc, fishId }: { doc: GameDocument; fishId: FishId }) {
  const result = computeStudy(doc);
  const stat = result.byFish[fishId];
  if (!stat)
    return (
      <p className="study-note">
        当前研究条件下没有这尾鱼的咬钩样本。换一个时间窗或等待区间再看看。
      </p>
    );
  const low = stat.effectiveN < 5;
  return (
    <div className="fish-study">
      <div className="study-kpis">
        <span>
          <b>{stat.effectiveN.toFixed(1)}</b> 有效样本
        </span>
        <span>
          <b>{stat.landed.toFixed(1)}</b> 捕获
        </span>
        <span>
          <b>{stat.lost.toFixed(1)}</b> 脱钩
        </span>
        <span>
          <b>{stat.missed.toFixed(1)}</b> 错过
        </span>
      </div>
      {low && (
        <p className="low-sample">
          <AlertTriangle size={12} /> 低样本猜测：有效样本不足 5，以下范围可能大幅变动。
        </p>
      )}
      <div className="study-block">
        <h4>活动范围</h4>
        {stat.spots.map((s) => (
          <ShareRow
            key={s.spot}
            label={spotName(s.spot)}
            share={s.share}
            low={s.low}
            high={s.high}
            n={s.n}
          />
        ))}
      </div>
      <div className="study-block">
        <h4>鱼饵偏好</h4>
        {stat.baits.map((b) => (
          <ShareRow
            key={b.bait}
            label={baitName(b.bait)}
            share={b.share}
            low={b.low}
            high={b.high}
            n={b.n}
          />
        ))}
      </div>
      <div className="study-block">
        <h4>咬钩等待</h4>
        <p className="study-note">
          {stat.wait.medianMs === null
            ? "没有可用的等待样本。"
            : `中位 ${formatDuration(stat.wait.medianMs)}，四分位 ${formatDuration(
                stat.wait.lowMs ?? 0,
              )}–${formatDuration(stat.wait.highMs ?? 0)}；观测范围 ${formatDuration(
                stat.wait.minMs ?? 0,
              )}–${formatDuration(stat.wait.maxMs ?? 0)}（范围随样本变化，不是物种极限）。`}
          {stat.wait.coarseCount > 0 &&
            ` 其中 ${stat.wait.coarseCount} 组来自 1 秒粗区间，只有桶中值可用。`}
        </p>
      </div>
      <p className="study-note">{stat.lapseNote}</p>
    </div>
  );
}

export function StudyPanel({
  doc,
  send,
}: {
  doc: GameDocument;
  send: (c: Command) => void;
}) {
  const [detail, setDetail] = useState<FishId | null>(null);
  const result = computeStudy(doc);
  const study = doc.study;
  const patch = (p: Partial<StudyCriteria>) => send({ type: "study", patch: p });
  const fishOrder = (
    Object.keys(result.byFish) as FishId[]
  ).sort(
    (a, b) =>
      (result.byFish[b]?.effectiveN ?? 0) - (result.byFish[a]?.effectiveN ?? 0),
  );

  return (
    <section className="study-panel" id="study">
      <div className="section-title">
        <Microscope size={17} />
        <h2>研究条件</h2>
        <span>同一份手记，可以被反复重读</span>
      </div>
      <p className="study-intro">
        选定时间窗、等待时长与连续换饵序列。只有精细片段能回答“先后顺序”和“精确到秒”的问题；
        压缩后的粗区间会按覆盖比例参与，但不会伪装成完整观察。
      </p>

      <div className="study-grid">
        <fieldset className="study-card">
          <legend>时间窗</legend>
          <div className="study-fields">
            <TimeField
              label="起"
              value={study.start}
              onChange={(start) => patch({ start })}
            />
            <TimeField
              label="止"
              value={study.end}
              onChange={(end) => patch({ end })}
            />
          </div>
          <small>
            一次等待跨越窗口边界时，会按落在窗内的实际等待时长分摊。
          </small>
        </fieldset>

        <fieldset className="study-card">
          <legend>等待时长</legend>
          <div className="study-fields">
            <WaitField
              label="最短"
              value={study.waitMinMs}
              onChange={(waitMinMs) => patch({ waitMinMs })}
            />
            <WaitField
              label="最长"
              value={study.waitMaxMs}
              onChange={(waitMaxMs) => patch({ waitMaxMs })}
            />
          </div>
          <small>
            只统计等待落在区间内的那部分时间；不足或超出的暴露会被分摊。
          </small>
        </fieldset>

        <fieldset className="study-card sequence-card">
          <legend>连续换饵序列</legend>
          <div className="sequence-editor">
            {study.baitSequence.length === 0 && (
              <small className="sequence-empty">未设置序列，统计全部精细片段。</small>
            )}
            {study.baitSequence.map((b, i) => (
              <span className="sequence-chip" key={`${b}-${i}`}>
                {i + 1}. {baitName(b)}
                <button
                  aria-label={`移除第 ${i + 1} 个换饵`}
                  onClick={() =>
                    patch({
                      baitSequence: study.baitSequence.filter((_, j) => j !== i),
                    })
                  }
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
          <div className="sequence-actions">
            {baits.map((b) => (
              <button
                key={b.id}
                disabled={study.baitSequence.length >= 6}
                onClick={() =>
                  patch({
                    baitSequence: [...study.baitSequence, b.id as BaitId],
                  })
                }
              >
                + {b.name}
              </button>
            ))}
            <button
              disabled={!study.baitSequence.length}
              onClick={() =>
                patch({ baitSequence: study.baitSequence.slice(0, -1) })
              }
            >
              <Undo2 size={11} /> 撤回
            </button>
            <button
              disabled={!study.baitSequence.length}
              onClick={() => patch({ baitSequence: [] })}
            >
              清空
            </button>
          </div>
          <small>
            {result.sequenceActive
              ? `序列研究只使用精细片段，${result.sequenceCoarseExcluded} 组粗区间被排除；已匹配 ${result.sequenceMatches} 条片段。`
              : "设置序列后，只有精细记录能确认相邻两次换饵，粗区间会被排除。"}
          </small>
        </fieldset>
      </div>

      <div className="study-actions">
        <button
          className="text-btn"
          onClick={() => send({ type: "study", patch: emptyStudy })}
        >
          <RotateCcw size={12} /> 重置研究条件
        </button>
        <span className="study-status">
          {result.hasData
            ? `当前条件下原始记录 ${result.attempts.toFixed(1)} 次 · 加权有效样本 ${result.effectiveN.toFixed(1)}`
            : "当前条件下没有观察样本"}
        </span>
      </div>

      {result.hasData && (
        <>
          <div className="study-summary">
            <div>
              <span>
                <Timer size={13} /> 咬钩前等待
              </span>
              <strong>
                {result.wait.medianMs === null
                  ? "—"
                  : formatDuration(result.wait.medianMs)}
              </strong>
              <small>
                {result.wait.medianMs === null
                  ? "无样本"
                  : `四分位 ${formatDuration(result.wait.lowMs ?? 0)}–${formatDuration(
                      result.wait.highMs ?? 0,
                    )} · 观测 ${formatDuration(
                      result.wait.minMs ?? 0,
                    )}–${formatDuration(result.wait.maxMs ?? 0)}`}
              </small>
            </div>
            <div>
              <span>咬钩率</span>
              <strong>{formatPercent(result.biteRate.rate)}</strong>
              <small>
                可信 {formatRange(result.biteRate.low, result.biteRate.high)}
              </small>
            </div>
            <div>
              <span>提竿后上岸率</span>
              <strong>{formatPercent(result.landingRate.rate)}</strong>
              <small>
                可信 {formatRange(result.landingRate.low, result.landingRate.high)}
              </small>
            </div>
            <div>
              <span>观察完成度</span>
              <strong>{formatPercent(result.completion.rate)}</strong>
              <small>
                可信 {formatRange(result.completion.low, result.completion.high)} ·
                完整（捕获/脱钩）{result.complete.toFixed(1)} · 不完整（错过/早收）{" "}
                {result.incomplete.toFixed(1)}
              </small>
            </div>
            <div>
              <span>累计等待暴露</span>
              <strong>{formatDuration(result.exposureMs)}</strong>
              <small>跨窗口部分已按重叠时长分摊</small>
            </div>
          </div>

          {(result.coarseMatched > 0 || result.proratedFine > 0) && (
            <p className="quality-banner">
              <AlertTriangle size={12} />
              {result.coarseMatched > 0
                ? `本次研究有 ${result.coarseMatched} 组粗区间参与，等待精度只到 1 秒桶，时间窗只能按整天比例估计。`
                : `本次研究有 ${result.proratedFine} 条片段跨窗口，已按实际暴露分摊。`}
            </p>
          )}
          <p className="study-note">
            权重：完整捕获 ×1.00 · 脱钩 ×0.85 · 错过咬钩 ×0.80 · 提前收竿
            ×0.30；等待与窗口/bait 区间只重叠一部分时再按比例缩减。
            {result.proratedFine > 0 &&
              ` 有 ${result.proratedFine} 条精细片段跨越研究窗口，已按实际暴露分摊。`}
            {result.bandProrated > 0 &&
              ` 有 ${result.bandProrated} 组粗区间的桶只部分落入等待区间，已按覆盖比例分摊。`}
            {result.coarseMatched > 0 &&
              ` 另有 ${result.coarseMatched} 组粗区间参与统计：等待只能用 1 秒桶，落入研究窗口的份额只能按整天比例估计，先后顺序不可用。`}
          </p>

          <div className="study-columns">
            <div className="study-block">
              <h3>
                <MapPin size={14} /> 活动范围
              </h3>
              {result.bySpot.length === 0 && (
                <p className="study-note">没有可用的钓点样本。</p>
              )}
              {result.bySpot.map((s) => (
                <div className="spot-study" key={s.spot}>
                  <div className="share-row">
                    <span>{spotName(s.spot)}</span>
                    <b>{formatPercent(s.rate)} 咬钩</b>
                    <small>
                      可信 {formatRange(s.low, s.high)} · 原始 {s.raw.toFixed(0)} 次 ·
                      n≈{s.effectiveN.toFixed(1)}
                    </small>
                  </div>
                  {s.species.length > 0 && (
                    <div className="species-shares">
                      {s.species.slice(0, 3).map((sp) => (
                        <span key={sp.fish}>
                          {species(sp.fish).name} {formatPercent(sp.share)}
                          <small>
                            {" "}
                            ({formatRange(sp.low, sp.high)})
                          </small>
                        </span>
                      ))}
                    </div>
                  )}
                  <small className="spot-rec">
                    {(() => {
                      const rec = recommendBait(result, s.spot);
                      if (!rec) return "样本不足，暂不能推荐鱼饵。";
                      return `建议鱼饵：${baitName(rec.bait)} · 咬钩 ${formatPercent(
                        rec.rate,
                      )}（${formatRange(rec.low, rec.high)}，n≈${rec.n.toFixed(
                        1,
                      )}）${rec.lowSample ? " · 低样本猜测" : ""}`;
                    })()}
                  </small>
                </div>
              ))}
            </div>

            <div className="study-block">
              <h3>
                <Fish size={14} /> 鱼种偏好与活动时段
              </h3>
              {fishOrder.length === 0 && (
                <p className="study-note">还没有辨认出鱼种的咬钩样本。</p>
              )}
              {fishOrder.map((id) => {
                const stat = result.byFish[id];
                if (!stat) return null;
                const open = detail === id;
                return (
                  <div className="fish-study-row" key={id}>
                    <button
                      className="fish-study-head"
                      aria-expanded={open}
                      onClick={() => setDetail(open ? null : id)}
                    >
                      <span>{species(id).name}</span>
                      <small>
                        n≈{stat.effectiveN.toFixed(1)} · 上岸{" "}
                        {Math.round(
                          (stat.landed / Math.max(0.001, stat.bites)) * 100,
                        )}
                        %
                        {stat.effectiveN < 5 && <em> 低样本猜测</em>}
                      </small>
                      <ChevronDown
                        size={13}
                        className={open ? "open" : ""}
                        aria-hidden
                      />
                    </button>
                    {open && <FishStudy doc={doc} fishId={id} />}
                  </div>
                );
              })}
              <p className="study-note">
                <Sparkles size={11} /> 这里的比例是按有效样本加权的区间估计，不是真实鱼群概率。
              </p>
            </div>
          </div>

          <div className="study-columns">
            <div className="study-block">
              <h3>
                <MapPin size={14} /> 按钓点的鱼饵表现
              </h3>
              <div className="bait-table">
                {waters.map((w) => {
                  const rows = result.baitsBySpot[w.id] ?? [];
                  if (rows.length === 0) return null;
                  return (
                    <div key={w.id} className="bait-table-group">
                      <strong>{w.name}</strong>
                      {rows.map((b) => (
                        <div className="bait-table-row" key={b.bait}>
                          <span>{baitName(b.bait)}</span>
                          <b>{formatPercent(b.rate)}</b>
                          <small>
                            {formatRange(b.low, b.high)} · n≈
                            {b.effectiveN.toFixed(1)}
                          </small>
                          {b.bites <= 0 ? (
                            <em>未见咬钩</em>
                          ) : (
                            b.lowSample && <em>低样本</em>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
                {Object.keys(result.baitsBySpot).every(
                  (k) => (result.baitsBySpot[k as SpotId] ?? []).length === 0,
                ) && <p className="study-note">没有鱼饵样本。</p>}
              </div>
            </div>

            <div className="study-block facts-block">
              <h3>
                <Fish size={14} /> 已知事实（不随研究条件变化）
              </h3>
              {Object.keys(doc.facts).length === 0 ? (
                <p className="study-note">还没有捕获事实。</p>
              ) : (
                <div className="facts-list">
                  {Object.entries(doc.facts).map(([id, fact]) => (
                    <div key={id}>
                      <span>{species(id).name}</span>
                      <b>{fact?.count ?? 0} 尾</b>
                      <small>
                        最大 {fact?.best.toFixed(2)} kg
                        {fact?.legacy
                          ? ` · 其中 ${fact.legacy} 尾为旧手记迁移，仅有事实`
                          : ""}
                      </small>
                    </div>
                  ))}
                </div>
              )}
              <p className="study-note">
                捕获事实只说明“确实捕到过”，不包含等待、咬钩或换饵顺序，因此不会进入上面的研究样本。
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
