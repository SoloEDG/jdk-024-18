import { useMemo, useState } from "react";
import {
  NotebookPen,
  Archive,
  Scissors,
  AlertTriangle,
  Timer,
  Fish,
  Layers,
  Radio,
} from "lucide-react";
import type {
  CoarseObservation,
  FineObservation,
  GameDocument,
} from "../../../shared/types";
import type { Command } from "../../../shared/commands";
import { MAX_FINE_OBSERVATIONS } from "../../../shared/initial";
import { species } from "../../../shared/catalog";
import {
  outcomeLabel,
  baitName,
  spotName,
  formatClock,
  formatDay,
  formatDateTimeLocal,
  fromDateTimeLocal,
  coarseWaitLabel,
} from "../lib/format";
import { formatDuration } from "../lib/statistics";
import { matchedFineIds } from "../lib/study";

function FineRow({
  obs,
  studied,
}: {
  obs: FineObservation;
  studied: boolean;
}) {
  return (
    <li className={"obs-row " + obs.outcome + (studied ? " studied" : "")}>
      <span className={"obs-tag " + obs.outcome}>{outcomeLabel[obs.outcome]}</span>
      <span className="obs-main">
        <strong>
          {spotName(obs.spot)} · {baitName(obs.bait)}
          {obs.fish && obs.outcome !== "missed"
            ? ` · ${species(obs.fish).name}`
            : obs.outcome === "missed"
              ? " · 未看清鱼种"
              : ""}
        </strong>
        <small>
          {formatClock(obs.castAt)} 抛竿 ·
          {obs.outcome === "retrieved"
            ? ` 等待 ${formatDuration(obs.waitMs)} 后收回`
            : ` 等待 ${formatDuration(obs.waitMs)} 后${
                obs.outcome === "missed" ? "错过咬钩" : "咬钩"
              }`}
          {obs.weight !== undefined && ` · ${obs.weight.toFixed(2)} kg`}
        </small>
      </span>
      {studied && <Radio size={11} className="studied-mark" aria-label="符合当前研究条件" />}
    </li>
  );
}

function CoarseRow({ obs }: { obs: CoarseObservation }) {
  return (
    <li className="obs-row coarse">
      <span className="obs-tag coarse">{outcomeLabel[obs.outcome]}</span>
      <span className="obs-main">
        <strong>
          {spotName(obs.spot)} · {baitName(obs.bait)}
          {obs.fish && ` · ${species(obs.fish).name}`}
        </strong>
        <small>
          {formatDay(obs.dayStart)} 的粗区间 · 等待落在
          {coarseWaitLabel(obs.waitMinMs, obs.waitMaxMs)} · 同组 {obs.count} 次
        </small>
        <small className="precision-lost">
          精确时刻、先后顺序、单次等待已不可还原
        </small>
      </span>
    </li>
  );
}

export function JournalPanel({
  doc,
  send,
}: {
  doc: GameDocument;
  send: (c: Command) => void;
}) {
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const studiedIds = useMemo(() => matchedFineIds(doc), [doc]);
  const byDay = useMemo(() => {
    const map = new Map<number, FineObservation[]>();
    for (const o of doc.observations) {
      const day = new Date(o.castAt);
      day.setHours(0, 0, 0, 0);
      const key = day.getTime();
      const list = map.get(key) ?? [];
      list.push(o);
      map.set(key, list);
    }
    return [...map.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([day, list]) => [
        day,
        list.sort((a, b) => b.castAt - a.castAt),
      ] as const);
  }, [doc.observations]);
  const coarseByDay = useMemo(() => {
    const map = new Map<number, CoarseObservation[]>();
    for (const c of doc.coarse) {
      const list = map.get(c.dayStart) ?? [];
      list.push(c);
      map.set(c.dayStart, list);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [doc.coarse]);
  const full = doc.observations.length >= MAX_FINE_OBSERVATIONS;
  const usable =
    from || to
      ? { start: fromDateTimeLocal(from), end: fromDateTimeLocal(to) }
      : null;
  const bounds =
    usable && usable.start !== null && usable.end !== null
      ? {
          lo: Math.min(usable.start, usable.end),
          hi: Math.max(usable.start, usable.end),
        }
      : null;
  const rangeCount = bounds
    ? doc.observations.filter(
        (o) => o.castAt >= bounds.lo && o.castAt < bounds.hi,
      ).length
    : 0;

  return (
    <section className="journal-panel" id="journal">
      <div className="section-title">
        <NotebookPen size={17} />
        <h2>观察手记</h2>
        <span>
          精细 {doc.observations.length}/{MAX_FINE_OBSERVATIONS} · 粗区间{" "}
          {doc.coarse.length} 组
        </span>
      </div>
      <p className="journal-intro">
        等待、咬钩、脱钩与捕获都会留下片段。精细片段能重放精确等待与换饵顺序；
        粗区间只保留到“某天 + 1 秒等待桶”，能重新参与新的时间窗与等待条件，
        但无法再回答先后顺序与精确时长。
      </p>

      <div className="capacity">
        <progress
          aria-label="精细片段容量"
          max={MAX_FINE_OBSERVATIONS}
          value={doc.observations.length}
        />
        <div>
          <span>
            <Layers size={12} /> 精细片段空间
          </span>
          <strong>
            {doc.observations.length} / {MAX_FINE_OBSERVATIONS}
          </strong>
        </div>
        {full && (
          <p className="capacity-warn">
            <AlertTriangle size={12} /> 精细空间已满。之后的新观察如何记录，由你决定：
          </p>
        )}
      </div>

      <fieldset className="policy">
        <legend>空间不足时的记录策略</legend>
        <label>
          <input
            type="radio"
            name="journal-policy"
            checked={doc.journalPolicy === "coarse-new"}
            onChange={() =>
              send({ type: "journal-policy", policy: "coarse-new" })
            }
          />
          新观察直接存为粗区间：保住已有精细片段，但新记录失去精确时刻与顺序。
        </label>
        <label>
          <input
            type="radio"
            name="journal-policy"
            checked={doc.journalPolicy === "compress-oldest"}
            onChange={() =>
              send({ type: "journal-policy", policy: "compress-oldest" })
            }
          />
          自动压缩最旧约四分之一片段：新观察保持精细，但最旧的观察只剩粗区间。
        </label>
      </fieldset>

      <fieldset className="compress">
        <legend>
          <Scissors size={12} /> 手动压缩某一时间窗
        </legend>
        <p className="compress-hint">
          压缩后，该窗口内的片段将只剩日期与 1 秒等待桶，不能再用于连续换饵序列研究。
          操作不可撤销。
        </p>
        <div className="compress-fields">
          <label>
            起
            <input
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            止
            <input
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        <button
          className="text-btn"
          disabled={
            !bounds || rangeCount === 0
          }
          onClick={() => {
            if (!bounds) return;
            send({ type: "compress-range", from: bounds.lo, to: bounds.hi });
            setFrom("");
            setTo("");
          }}
        >
          <Archive size={12} /> 压缩此时间窗内的精细片段
        </button>
        {bounds && (
          <small className="compress-preview">
            将处理 {formatDateTimeLocal(bounds.lo)} 至{" "}
            {formatDateTimeLocal(bounds.hi)} 之间的 {rangeCount} 条精细片段。
            {rangeCount === 0 && " 该窗口内没有精细片段。"}
          </small>
        )}
      </fieldset>

      <div className="journal-lists">
        {doc.observations.length === 0 && doc.coarse.length === 0 && (
          <p className="journal-empty">
            <Timer size={20} />
            还没有观察片段。去抛一竿，等待也会被记下。
          </p>
        )}
        {byDay.map(([day, rows]) => (
          <div className="obs-day" key={day}>
            <h3>
              {formatDay(day)}
              <small>{rows.length} 条精细片段</small>
              <button
                className="day-compress"
                title="把这一天的精细片段压缩为粗区间"
                onClick={() =>
                  send({
                    type: "compress-range",
                    from: day,
                    to: day + 24 * 3600 * 1000,
                  })
                }
              >
                <Scissors size={10} /> 压缩当天
              </button>
            </h3>
            <ul>
              {rows.map((o) => (
                <FineRow
                  key={o.id}
                  obs={o}
                  studied={studiedIds.has(o.id)}
                />
              ))}
            </ul>
          </div>
        ))}
        {coarseByDay.map(([day, rows]) => (
          <div className="obs-day coarse-day" key={`c-${day}`}>
            <h3>
              {formatDay(day)}
              <small>{rows.reduce((n, r) => n + r.count, 0)} 次粗区间记录</small>
            </h3>
            <ul>
              {rows.map((r) => (
                <CoarseRow key={r.id} obs={r} />
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="journal-foot">
        <Fish size={11} />
        只有精细片段能确认“连续换饵”的先后；设置序列研究时，粗区间会被排除，统计口径也会随之变窄。
      </p>
    </section>
  );
}
