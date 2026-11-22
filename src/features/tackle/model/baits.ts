import type { BaitId } from "../../../shared/types";
export const baits: {
  id: BaitId;
  name: string;
  icon: string;
  note: string;
  color: string;
}[] = [
  {
    id: "worm",
    name: "鲜活蚯蚓",
    icon: "〰",
    note: "活饵 · 气味自然",
    color: "#ba8477",
  },
  {
    id: "corn",
    name: "甜玉米粒",
    icon: "⠿",
    note: "素饵 · 颗粒下沉",
    color: "#d4ac62",
  },
  {
    id: "fly",
    name: "羽毛拟蝇",
    icon: "⌁",
    note: "拟饵 · 贴近水面",
    color: "#779ba0",
  },
];
export function baitLabel(id: BaitId) {
  return baits.find((b) => b.id === id)?.name ?? id;
}
