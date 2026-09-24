import { useMemo } from "react";
import type { Schedule } from "../schedule";
import { formatTime } from "../time";
import { modelColor } from "../modelColor";

interface Props {
  schedule: Schedule;
  playheadMs: number | null;
  playing: boolean;
  movedId?: string;
  blockedIds?: string[];
}

export default function Timeline({ schedule, playheadMs, playing, movedId, blockedIds }: Props) {
  const total = Math.max(schedule.totalMs, ...schedule.anchors.map((t) => t.entry.timeMs), 1000);
  const pct = (ms: number) => `${(ms / total) * 100}%`;

  const ticks = useMemo(() => {
    const step = total > 150000 ? 30000 : 15000;
    const arr: number[] = [];
    for (let t = 0; t <= total; t += step) arr.push(t);
    if (arr[arr.length - 1] !== total) arr.push(total);
    return arr;
  }, [total]);

  return (
    <div className="timeline-wrap">
      <div className="timeline">
        {/* 刻度 */}
        <div className="tl-ruler">
          {ticks.map((t) => (
            <span key={t} style={{ left: pct(t) }} className="tl-tick">
              {formatTime(t)}
            </span>
          ))}
        </div>

        {/* 锚点竖线 */}
        {schedule.anchors.map(({ entry }) => (
          <div key={entry.id} className="tl-anchor-line" style={{ left: pct(entry.timeMs) }}>
            <span>🎵 {entry.name}</span>
          </div>
        ))}

        {/* 点火窗口 */}
        {schedule.timed.map((t) => {
          const lit =
            playheadMs !== null && playheadMs >= t.startMs && playheadMs < t.endMs;
          const blocked = blockedIds?.includes(t.entry.id);
          const moved = movedId === t.entry.id;
          return (
            <div
              key={t.entry.id}
              className={[
                "tl-block",
                lit ? "lit" : "",
                t.overflow ? "overflow" : "",
                blocked ? "blocked" : "",
                moved ? "moved" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{
                left: pct(t.startMs),
                width: `calc(${pct(t.endMs - t.startMs)} + 2px)`,
                minWidth: 5,
                background: modelColor(t.entry.model),
              }}
              title={`${t.entry.name} ${formatTime(t.startMs)}–${formatTime(t.endMs)}`}
            >
              <span className="tl-block-name">{t.entry.name}</span>
              <span className="tl-block-time">{formatTime(t.startMs)}</span>
            </div>
          );
        })}

        {/* 播放头 */}
        {playheadMs !== null && (
          <div className="tl-playhead" style={{ left: pct(Math.min(playheadMs, total)) }} />
        )}
      </div>
      <p className="tl-status">
        {schedule.playable ? (
          <em className="ok">● 当前版本所有点火窗口均可在对应锚点前完整播放</em>
        ) : (
          <em className="bad">● 存在越过音乐锚点的点火窗口，此版本不可播放</em>
        )}
        {playing && <em className="playing-tag">▶ 预览中 {formatTime(playheadMs ?? 0)}</em>}
        <em className="muted">总时长 {formatTime(schedule.totalMs)}</em>
      </p>
    </div>
  );
}
