import type { Entry, Script } from "./types";

const s = (
  id: string,
  name: string,
  model: string,
  caliber: string,
  angleDeg: number,
  durationMs: number,
  safetyM: number,
  point: string
): Entry => ({ kind: "segment", id, name, model, caliber, angleDeg, durationMs, safetyM, point });

const a = (id: string, name: string, timeMs: number): Entry => ({
  kind: "anchor",
  id,
  name,
  timeMs,
});

/**
 * 内置示例脚本：音乐锚点把整场切成 5 个排布块。
 * 每块内段落首尾相接，锚点固定，换位只在“改动段 → 下一锚点”之间重排。
 */
export function createSampleScript(): Script {
  return {
    entries: [
      a("a0", "音乐起 · Intro", 0),
      s("s1", "Intro 冷焰引场", "30mm扇形架", "30mm", 60, 12500, 35, "A"),
      s("s2", "Verse 1 烛光铺底", "20mm罗马烛光", "20mm", 45, 18000, 25, "B"),
      s("s3", "Verse 2 扇形展开", "30mm扇形架", "30mm", 75, 22000, 35, "C"),

      a("a1", "Pre-Chorus 进鼓", 55000),
      s("s4", "Pre-Chorus 冷焰上升", "冷焰火", "—", 90, 8000, 8, "D"),
      s("s5", "Chorus A 首发礼花", "75mm礼花弹", "75mm", 85, 5200, 60, "A"),

      a("a2", "Chorus A 重拍", 68200),
      s("s6", "重拍齐射", "75mm礼花弹", "75mm", 90, 4500, 60, "E"),
      s("s7", "Chorus 烛光连击", "20mm罗马烛光", "20mm", 50, 16000, 25, "B"),
      s("s8", "Bridge 冷焰桥接", "冷焰火", "—", 90, 12000, 8, "D"),

      a("a3", "Drop 低音", 105000),
      s("s9", "Drop 大弹升空", "100mm礼花弹", "100mm", 90, 8000, 80, "E"),
      s("s10", "Drop 扇形交叉", "30mm扇形架", "30mm", 65, 15000, 35, "C"),

      a("a4", "Finale 终章", 132000),
      s("s11", "终章烛光波浪", "20mm罗马烛光", "20mm", 45, 14000, 25, "B"),
      s("s12", "终章冷焰齐燃", "冷焰火", "—", 90, 20000, 8, "D"),
      s("s13", "Grand 大弹收官", "100mm礼花弹", "100mm", 88, 10000, 80, "A"),
    ],
  };
}
