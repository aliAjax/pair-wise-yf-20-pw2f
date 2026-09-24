/** 毫秒 → mm:ss.mmm */
export function formatTime(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const m = Math.floor(clamped / 60000);
  const s = Math.floor((clamped % 60000) / 1000);
  const milli = clamped % 1000;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(milli).padStart(3, "0")}`;
}

/** 秒数（一位小数）→ 毫秒，用于持续时间输入 */
export function secondsToMs(sec: number): number {
  return Math.round(sec * 1000);
}

export function msToSeconds(ms: number): number {
  return Math.round(ms) / 1000;
}

/**
 * 解析 mm:ss.mmm / ss.mmm / mm:ss；无法解析返回 null
 */
export function parseTime(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const m = t.match(/^(?:(\d+):)?(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (!m) return null;
  const minutes = m[1] !== undefined ? Number(m[1]) : 0;
  const seconds = Number(m[2]);
  if (seconds >= 60 && m[1] !== undefined) return null;
  const frac = m[3] ? Number(m[3].padEnd(3, "0")) : 0;
  return minutes * 60000 + seconds * 1000 + frac;
}

export function formatDate(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function formatDay(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}月${p(d.getDate())}日`;
}
