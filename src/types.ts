export interface Segment {
  kind: "segment";
  id: string;
  /** 节目段落名称 */
  name: string;
  /** 烟花型号，如 75mm礼花弹 */
  model: string;
  /** 口径 */
  caliber: string;
  /** 发射角度（度） */
  angleDeg: number;
  /** 持续时间（毫秒） */
  durationMs: number;
  /** 安全距离（米） */
  safetyM: number;
  /** 燃放点位 A-E */
  point: string;
}

export interface MusicAnchor {
  kind: "anchor";
  id: string;
  /** 音乐锚点名称 */
  name: string;
  /** 固定时刻（毫秒），换位时锚点本身留在原时刻 */
  timeMs: number;
}

export type Entry = Segment | MusicAnchor;

export interface Script {
  entries: Entry[];
}

/** 一次“当晚演出值”的确认快照 */
export interface ShowSnapshot {
  at: number;
  script: Script;
}

/** 一个场次：草稿与已确认演出值分开存放，互不覆盖 */
export interface Night {
  id: string;
  label: string;
  createdAt: number;
  draft: Script;
  show?: ShowSnapshot;
}

export interface Persist {
  version: 1;
  activeId: string;
  nights: Night[];
}
