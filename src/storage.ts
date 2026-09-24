import type { Night, Persist, Script } from "./types";

const KEY = "hxyfront-62008/rehearsal/v1";

export function loadPersist(): Persist | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Persist;
    if (data.version !== 1 || !Array.isArray(data.nights) || !data.nights.length) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function savePersist(data: Persist): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 存储不可用时静默降级（内存态仍可工作）
  }
}

export function cloneScript(script: Script): Script {
  return JSON.parse(JSON.stringify(script)) as Script;
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 彩排序号：已存在的“第 N 次彩排”最大序号 +1 */
export function nextRehearsalNo(nights: Night[]): number {
  let max = 0;
  for (const n of nights) {
    const m = n.label.match(/第\s*(\d+)\s*次彩排/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}
