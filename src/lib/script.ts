export interface Segment {
  id: string;
  name: string; // 节目段落
  type: string; // 烟花型号
  caliber: string; // 口径
  angle: number; // 发射角度
  duration: number; // 持续时间（秒）
  safety: number; // 安全距离（米）
  anchor: boolean; // 是否音乐锚点
  anchorTime: number; // 锚点时刻（秒），仅锚点使用
}

export interface Script {
  gap: number; // 串场间隔（秒）
  segments: Segment[];
}

export interface TimedSegment extends Segment {
  start: number; // 点火时间（秒）
  end: number; // 窗口结束（秒）
}

export interface Conflict {
  blockedId: string; // 受阻段
  anchorId: string; // 被越过的锚点
  blockedStart: number;
  blockedEnd: number;
  anchorTime: number;
}

export const FIREWORK_TYPES = ["礼花弹", "罗马烛光", "扇形架", "冷焰火"];

export function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `seg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 秒 → mm:ss.d */
export function fmtTime(t: number): string {
  const sign = t < 0 ? "-" : "";
  const abs = Math.abs(t);
  const m = Math.floor(abs / 60);
  const s = abs - m * 60;
  return `${sign}${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}

/** 解析 "mm:ss" / "mm:ss.d" / 纯秒数，失败返回 null */
export function parseTime(raw: string): number | null {
  const m = raw.trim().match(/^(?:(\d{1,3}):)?(\d{1,2}(?:\.\d{1,2})?)$/);
  if (!m) return null;
  const minutes = m[1] ? Number(m[1]) : 0;
  const seconds = Number(m[2]);
  if (m[1] && seconds >= 60) return null;
  return minutes * 60 + seconds;
}

export function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString("zh-CN", { hour12: false });
}

export function fmtDate(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 由段落顺序推导点火时间：非锚点段落接在上一段窗口结束 + 串场间隔之后；
 * 锚点段落钉在自己的时刻上。若某段的点火窗口越过下一处锚点，记为冲突（受阻段）。
 */
export function schedule(script: Script): {
  timed: TimedSegment[];
  conflicts: Conflict[];
  total: number;
} {
  const timed: TimedSegment[] = [];
  let cursor = 0;
  for (const seg of script.segments) {
    const start = seg.anchor ? seg.anchorTime : cursor;
    const end = start + Math.max(0, seg.duration);
    timed.push({ ...seg, start, end });
    cursor = end + script.gap;
  }

  const conflicts: Conflict[] = [];
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      if (!timed[j].anchor) continue;
      if (timed[i].end > timed[j].start + 1e-6) {
        conflicts.push({
          blockedId: timed[i].id,
          anchorId: timed[j].id,
          blockedStart: timed[i].start,
          blockedEnd: timed[i].end,
          anchorTime: timed[j].start,
        });
      }
      break; // 只看最近的一处锚点
    }
  }

  const total = timed.reduce((acc, s) => Math.max(acc, s.end), 0);
  return { timed, conflicts, total };
}

export function cloneScript(script: Script): Script {
  return JSON.parse(JSON.stringify(script)) as Script;
}

// ---------- 本地存档：草稿自动保存，演出值另存快照、互不覆盖 ----------

const DRAFT_KEY = "hxy62008.fireworks.draft.v1";
const SHOWS_KEY = "hxy62008.fireworks.shows.v1";

export interface Draft {
  savedAt: number;
  script: Script;
  lastValid: Script; // 上一份可完整播放的脚本
}

export interface Snapshot {
  id: string;
  name: string;
  savedAt: number;
  script: Script;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存储不可用时静默降级，页面功能不受影响
  }
}

export const loadDraft = (): Draft | null => read<Draft>(DRAFT_KEY);
export const saveDraft = (draft: Draft): void => write(DRAFT_KEY, draft);
export const loadShows = (): Snapshot[] => read<Snapshot[]>(SHOWS_KEY) ?? [];
export const saveShows = (shows: Snapshot[]): void => write(SHOWS_KEY, shows);

// ---------- 示例脚本 ----------

export function defaultScript(): Script {
  return {
    gap: 8,
    segments: [
      { id: uid(), name: "序章·扇形迎宾", type: "扇形架", caliber: "30mm", angle: 60, duration: 25, safety: 35, anchor: false, anchorTime: 0 },
      { id: uid(), name: "主歌·银冠礼花", type: "礼花弹", caliber: "75mm", angle: 75, duration: 40, safety: 80, anchor: false, anchorTime: 0 },
      { id: uid(), name: "副歌·金雨", type: "礼花弹", caliber: "100mm", angle: 80, duration: 35, safety: 120, anchor: true, anchorTime: 90 },
      { id: uid(), name: "间奏·罗马烛光", type: "罗马烛光", caliber: "20mm", angle: 45, duration: 30, safety: 25, anchor: false, anchorTime: 0 },
      { id: uid(), name: "高潮·扇形齐射", type: "扇形架", caliber: "50mm", angle: 90, duration: 45, safety: 60, anchor: false, anchorTime: 0 },
      { id: uid(), name: "终曲·冷焰火瀑布", type: "冷焰火", caliber: "—", angle: 0, duration: 20, safety: 15, anchor: true, anchorTime: 250 },
    ],
  };
}
