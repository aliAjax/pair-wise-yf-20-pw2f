import { useEffect, useState } from "react";
import type { MusicAnchor, Segment } from "../types";
import { formatTime, msToSeconds, parseTime, secondsToMs } from "../time";

interface SegmentProps {
  segment: Segment;
  readOnly: boolean;
  blocked: boolean;
  onUpdate: (patch: Partial<Segment>) => void;
}

export function SegmentInspector({ segment, readOnly, blocked, onUpdate }: SegmentProps) {
  const [durText, setDurText] = useState(String(msToSeconds(segment.durationMs)));

  useEffect(() => {
    setDurText(String(msToSeconds(segment.durationMs)));
  }, [segment.durationMs, segment.id]);

  const commitDuration = () => {
    const val = Number(durText);
    if (Number.isFinite(val) && val > 0 && val <= 600) {
      onUpdate({ durationMs: secondsToMs(val) });
    } else {
      setDurText(String(msToSeconds(segment.durationMs)));
    }
  };

  return (
    <div className="inspector">
      <p className="inspector-kind" style={{ color: "#1d4ed8" }}>
        节目段落（点火窗口由顺序自动排定）
      </p>
      <label>
        <span>节目段落</span>
        <input
          value={segment.name}
          readOnly={readOnly}
          onChange={(e) => onUpdate({ name: e.target.value })}
        />
      </label>
      <div className="inspector-grid">
        <label>
          <span>烟花型号</span>
          <input
            value={segment.model}
            readOnly={readOnly}
            onChange={(e) => onUpdate({ model: e.target.value })}
          />
        </label>
        <label>
          <span>口径</span>
          <input
            value={segment.caliber}
            readOnly={readOnly}
            onChange={(e) => onUpdate({ caliber: e.target.value })}
          />
        </label>
        <label>
          <span>发射角度（°）</span>
          <input
            type="number"
            min={0}
            max={180}
            value={segment.angleDeg}
            readOnly={readOnly}
            onChange={(e) => onUpdate({ angleDeg: Number(e.target.value) })}
          />
        </label>
        <label>
          <span>持续时间（秒）</span>
          <input
            value={durText}
            readOnly={readOnly}
            step={0.5}
            onChange={(e) => setDurText(e.target.value)}
            onBlur={commitDuration}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        </label>
        <label>
          <span>安全距离（m）</span>
          <input
            type="number"
            min={0}
            value={segment.safetyM}
            readOnly={readOnly}
            onChange={(e) => onUpdate({ safetyM: Number(e.target.value) })}
          />
        </label>
        <label>
          <span>燃放点位</span>
          <select
            value={segment.point}
            disabled={readOnly}
            onChange={(e) => onUpdate({ point: e.target.value })}
          >
            {["A", "B", "C", "D", "E"].map((p) => (
              <option key={p} value={p}>
                点位 {p}
              </option>
            ))}
          </select>
        </label>
      </div>
      {blocked && <p className="field-warn">该段当前为受阻段：点火窗口越过了下一音乐锚点。</p>}
    </div>
  );
}

interface AnchorProps {
  anchor: MusicAnchor;
  readOnly: boolean;
  onUpdate: (patch: Partial<MusicAnchor>) => void;
}

export function AnchorInspector({ anchor, readOnly, onUpdate }: AnchorProps) {
  const [timeText, setTimeText] = useState(formatTime(anchor.timeMs));
  useEffect(() => {
    setTimeText(formatTime(anchor.timeMs));
  }, [anchor.timeMs, anchor.id]);

  const commit = () => {
    const ms = parseTime(timeText);
    if (ms !== null) onUpdate({ timeMs: ms });
    else setTimeText(formatTime(anchor.timeMs));
  };

  return (
    <div className="inspector">
      <p className="inspector-kind" style={{ color: "#b45309" }}>
        音乐锚点（换位时锚点本身留在原时刻）
      </p>
      <label>
        <span>锚点名称</span>
        <input
          value={anchor.name}
          readOnly={readOnly}
          onChange={(e) => onUpdate({ name: e.target.value })}
        />
      </label>
      <label>
        <span>固定时刻 mm:ss.mmm</span>
        <input
          value={timeText}
          readOnly={readOnly}
          onChange={(e) => setTimeText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
      </label>
      <p className="field-hint">当前固定时刻：{formatTime(anchor.timeMs)}</p>
    </div>
  );
}

interface AddAnchorProps {
  onAdd: (name: string, timeMs: number) => void;
}

export function AddAnchorForm({ onAdd }: AddAnchorProps) {
  const [name, setName] = useState("");
  const [timeText, setTimeText] = useState("");
  const [err, setErr] = useState("");

  const submit = () => {
    const ms = parseTime(timeText);
    if (!name.trim()) {
      setErr("请填写锚点名称");
      return;
    }
    if (ms === null) {
      setErr("时刻格式应为 mm:ss.mmm，如 01:30.000");
      return;
    }
    onAdd(name.trim(), ms);
    setName("");
    setTimeText("");
    setErr("");
  };

  return (
    <div className="inspector add-form">
      <p className="inspector-kind" style={{ color: "#b45309" }}>
        新增音乐锚点
      </p>
      <label>
        <span>锚点名称</span>
        <input value={name} placeholder="如 Chorus B 进唱" onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        <span>固定时刻 mm:ss.mmm</span>
        <input value={timeText} placeholder="01:30.000" onChange={(e) => setTimeText(e.target.value)} />
      </label>
      {err && <p className="field-warn">{err}</p>}
      <button className="primary full" onClick={submit}>
        插入锚点
      </button>
    </div>
  );
}
