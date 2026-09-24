import { useState } from "react";
import type { Script, Segment } from "../types";
import type { Schedule } from "../schedule";
import { formatTime } from "../time";
import { modelColor } from "../modelColor";

interface Props {
  script: Script;
  schedule: Schedule;
  selectedId: string | null;
  readOnly: boolean;
  movedId?: string;
  blockedIds?: string[];
  onSelect: (id: string) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onAddSegmentAfter: (afterId: string | null) => void;
  onDeleteSegment: (id: string) => void;
  onDeleteAnchor: (id: string) => void;
}

export default function ScriptList({
  script,
  schedule,
  selectedId,
  readOnly,
  movedId,
  blockedIds,
  onSelect,
  onMove,
  onAddSegmentAfter,
  onDeleteSegment,
  onDeleteAnchor,
}: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const timeOf = new Map(schedule.timed.map((t) => [t.entry.id, t]));

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null) return;
    let to = targetIndex;
    // 向下移动时 splice 插入位需要 +1
    if (targetIndex > dragIndex) to = targetIndex + 1;
    onMove(dragIndex, to);
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <ol className="script-list">
      {script.entries.map((entry, index) => {
        if (entry.kind === "anchor") {
          return (
            <li
              key={entry.id}
              className={["anchor-row", overIndex === index ? "drop-over" : ""]
                .filter(Boolean)
                .join(" ")}
              onDragOver={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
                setOverIndex(index);
              }}
              onDragLeave={() => setOverIndex((v) => (v === index ? null : v))}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(index);
              }}
              onClick={() => onSelect(entry.id)}
            >
              <div className="anchor-marker">🎵</div>
              <div className="anchor-body">
                <strong>{entry.name}</strong>
                <span className="anchor-time">{formatTime(entry.timeMs)}</span>
                <em className="anchor-fixed">锚点 · 固定时刻</em>
              </div>
              {!readOnly && (
                <button
                  className="mini danger"
                  title="删除锚点（相邻块合并重排）"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteAnchor(entry.id);
                  }}
                >
                  删除
                </button>
              )}
            </li>
          );
        }

        const seg = entry as Segment;
        const t = timeOf.get(seg.id);
        const isMoved = movedId === seg.id;
        const isBlocked = blockedIds?.includes(seg.id);
        const isDragging = dragIndex === index;
        return (
          <li
            key={seg.id}
            draggable={!readOnly}
            className={[
              "seg-row",
              selectedId === seg.id ? "selected" : "",
              t?.overflow ? "overflow" : "",
              isMoved ? "moved" : "",
              isBlocked ? "blocked" : "",
              isDragging ? "dragging" : "",
              overIndex === index ? "drop-over" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onSelect(seg.id)}
            onDragStart={() => setDragIndex(index)}
            onDragEnd={() => {
              setDragIndex(null);
              setOverIndex(null);
            }}
            onDragOver={(e) => {
              if (dragIndex === null) return;
              e.preventDefault();
              setOverIndex(index);
            }}
            onDragLeave={() => setOverIndex((v) => (v === index ? null : v))}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(index);
            }}
          >
            <div className="seg-grip" title="拖拽换位">⠿</div>
            <div className="seg-dot" style={{ background: modelColor(seg.model) }} />
            <div className="seg-main">
              <div className="seg-title-line">
                <strong>{seg.name}</strong>
                <span className="seg-time">
                  {t ? `${formatTime(t.startMs)} – ${formatTime(t.endMs)}` : "—"}
                </span>
              </div>
              <div className="seg-meta">
                <span>{seg.model}</span>
                <span>口径 {seg.caliber}</span>
                <span>仰角 {seg.angleDeg}°</span>
                <span>{seg.durationMs / 1000}s</span>
                <span>安全 {seg.safetyM}m</span>
                <span className="seg-point">点位 {seg.point}</span>
              </div>
            </div>
            <div className="seg-actions">
              {!readOnly && (
                <>
                  <button
                    className="mini"
                    title="上移（可跨过音乐锚点，越界将被阻止）"
                    disabled={index === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMove(index, index - 1);
                    }}
                  >
                    ↑
                  </button>
                  <button
                    className="mini"
                    title="下移（可跨过音乐锚点，越界将被阻止）"
                    disabled={index === script.entries.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMove(index, index + 1);
                    }}
                  >
                    ↓
                  </button>
                  <button
                    className="mini"
                    title="在其后新增段落"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddSegmentAfter(seg.id);
                    }}
                  >
                    ＋
                  </button>
                  <button
                    className="mini danger"
                    title="删除段落"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSegment(seg.id);
                    }}
                  >
                    删
                  </button>
                </>
              )}
            </div>
          </li>
        );
      })}
      {!readOnly && (
        <>
          <li
            className={["drop-zone", overIndex === script.entries.length ? "drop-over" : ""]
              .filter(Boolean)
              .join(" ")}
            onDragOver={(e) => {
              if (dragIndex === null) return;
              e.preventDefault();
              setOverIndex(script.entries.length);
            }}
            onDragLeave={() =>
              setOverIndex((v) => (v === script.entries.length ? null : v))
            }
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex === null) return;
              onMove(dragIndex, script.entries.length);
              setDragIndex(null);
              setOverIndex(null);
            }}
          >
            拖到此处置于脚本末尾
          </li>
          <li className="list-footer">
            <button className="mini" onClick={() => onAddSegmentAfter(null)}>
              ＋ 末尾新增段落
            </button>
          </li>
        </>
      )}
    </ol>
  );
}
