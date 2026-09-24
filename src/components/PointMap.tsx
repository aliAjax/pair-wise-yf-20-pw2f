import type { Schedule, TimedSegment } from "../schedule";
import { modelColor } from "../modelColor";

interface Props {
  schedule: Schedule;
  playheadMs: number | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** 五个固定燃放点位的俯视坐标（百分比） */
const POINT_POS: Record<string, { x: number; y: number }> = {
  A: { x: 50, y: 22 },
  B: { x: 20, y: 46 },
  C: { x: 80, y: 46 },
  D: { x: 34, y: 74 },
  E: { x: 66, y: 74 },
};

export default function PointMap({ schedule, playheadMs, selectedId, onSelect }: Props) {
  const byPoint = new Map<string, TimedSegment[]>();
  for (const t of schedule.timed) {
    const arr = byPoint.get(t.entry.point) ?? [];
    arr.push(t);
    byPoint.set(t.entry.point, arr);
  }

  return (
    <div className="point-map">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="map-svg">
        {/* 观众区与发射区 */}
        <rect x="4" y="84" width="92" height="12" rx="2" className="zone audience" />
        <line x1="4" y1="80" x2="96" y2="80" className="zone-line" />
        <text x="50" y="92.5" textAnchor="middle" className="zone-text">
          观众区（安全线 80m）
        </text>
      </svg>

      {Object.entries(POINT_POS).map(([point, pos]) => {
        const segs = byPoint.get(point) ?? [];
        const firing = segs.find(
          (t) => playheadMs !== null && playheadMs >= t.startMs && playheadMs < t.endMs
        );
        return (
          <div
            key={point}
            className={["map-point", firing ? "firing" : ""].filter(Boolean).join(" ")}
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          >
            <div className="point-pin" style={firing ? { background: modelColor(firing.entry.model) } : undefined}>
              {point}
            </div>
            <div className="point-stack">
              {segs.map((t) => (
                <button
                  key={t.entry.id}
                  className={[
                    "point-chip",
                    selectedId === t.entry.id ? "selected" : "",
                    t.overflow ? "overflow" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ borderColor: modelColor(t.entry.model) }}
                  title={`${t.entry.name} · ${t.entry.model} · ${t.entry.safetyM}m · 仰角${t.entry.angleDeg}°`}
                  onClick={() => onSelect(t.entry.id)}
                >
                  <i style={{ background: modelColor(t.entry.model) }} />
                  {t.entry.name}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
