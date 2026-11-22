import { useState } from "react";
import { BookOpen, Backpack, ArrowUpRight } from "lucide-react";
import type { GameDocument, FishId } from "../../../shared/types";
import type { Command } from "../../../shared/commands";
import { fishCatalog, species } from "../../../shared/catalog";
import { bagWeight } from "../lib/records";
import { FishIllustration } from "./FishIllustration";
export function CollectionPanel({
  doc,
  send,
}: {
  doc: GameDocument;
  send: (c: Command) => void;
}) {
  const [tab, setTab] = useState<"atlas" | "bag">("atlas");
  const [detail, setDetail] = useState<string | null>(null);
  const discovered = detail ? !!doc.facts[detail as FishId] : false;
  const fish = detail && discovered ? species(detail) : null;
  const fact = detail ? doc.facts[detail as FishId] : undefined;
  return (
    <section className="collection-panel">
      <div className="section-title">
        <BookOpen size={17} />
        <h2>湖畔图鉴</h2>
        <span>已发现 {Object.keys(doc.facts).length} 种</span>
      </div>
      <div className="mini-tabs">
        <button
          className={tab === "atlas" ? "active" : ""}
          onClick={() => setTab("atlas")}
        >
          <BookOpen size={13} />
          鱼类图鉴
        </button>
        <button
          className={tab === "bag" ? "active" : ""}
          onClick={() => setTab("bag")}
        >
          <Backpack size={13} />
          我的背包 <b>{doc.bag.length}</b>
        </button>
      </div>
      {tab === "atlas" ? (
        <>
          <p className="muted atlas-note">
            这里只记录“确实捕到过”的事实；活动范围、鱼饵偏好与等待规律，
            请在观察手记的研究台里按条件推断。
          </p>
          <div className="atlas-grid">
            {fishCatalog.map((f) => (
              <button
                className="fish-tile"
                key={f.id}
                onClick={() => setDetail(detail === f.id ? null : f.id)}
                aria-expanded={detail === f.id}
              >
                <FishIllustration fish={f} locked={!doc.facts[f.id]} />
                <span>{doc.facts[f.id] ? f.name : "待发现"}</span>
                <small>
                  {doc.facts[f.id] ? f.rarity : "未记录"}
                  <ArrowUpRight size={10} />
                </small>
              </button>
            ))}
          </div>
          {detail && (
            <div className="fish-detail">
              {fish && fact ? (
                <>
                  <strong>{fish.name}</strong>
                  <em>{fish.latin}</em>
                  <small className="fact-line">
                    捕获事实 · {fact.count} 尾 · 最大 {fact.best.toFixed(2)} kg
                    {fact.legacy
                      ? ` · 其中 ${fact.legacy} 尾迁自旧手记，仅有捕获事实`
                      : ""}
                  </small>
                  <p>
                    这只是事实记录。它出现在哪些水域、偏好什么鱼饵、通常等多久，
                    要从研究台里按时间窗与换饵条件推断。
                  </p>
                  <a className="detail-link" href="#study">
                    去研究台查看观察推断
                  </a>
                </>
              ) : (
                <>
                  <strong>尚未记录</strong>
                  <p>
                    没有捕获事实，也没有可辨认的观察。它属于哪片水域、偏好什么，
                    请靠实际垂钓一点点写下来。
                  </p>
                </>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="bag-list">
          <small>
            共 {doc.bag.length} 尾 · {bagWeight(doc.bag).toFixed(2)} kg
          </small>
          {doc.bag.length === 0 && (
            <div className="empty-bag">
              <Backpack size={26} />
              <p>背包里还没有收获</p>
              <small>第一尾鱼，正等着与你相遇。</small>
            </div>
          )}
          {doc.bag.map((c) => (
            <div className="bag-item" key={c.id}>
              <FishIllustration fish={species(c.fish)} />
              <span>
                <strong>{species(c.fish).name}</strong>
                <small>{c.weight.toFixed(2)} kg</small>
              </span>
              <button
                className="text-btn"
                onClick={() => send({ type: "release", id: c.id })}
              >
                放流
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="collection-foot">把每一次相遇，留在手记里。</p>
    </section>
  );
}
