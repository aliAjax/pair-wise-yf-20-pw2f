import { useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";
import type { Entry, MusicAnchor, Night, Persist, Script, Segment } from "./types";
import { computeSchedule, findProblems, moveSegment, type MoveProblem } from "./schedule";
import { createSampleScript } from "./sample";
import { cloneScript, loadPersist, nextRehearsalNo, savePersist, uid } from "./storage";
import { formatDay, formatTime } from "./time";
import Timeline from "./components/Timeline";
import ScriptList from "./components/ScriptList";
import PointMap from "./components/PointMap";
import Inventory from "./components/Inventory";
import VersionPanel from "./components/VersionPanel";
import { AddAnchorForm, AnchorInspector, SegmentInspector } from "./components/Inspector";

interface Flash {
  problem: MoveProblem;
  reason: "move" | "edit";
  at: number;
}

function initialState(): Persist {
  const saved = loadPersist();
  if (saved) return saved;
  const now = Date.now();
  const night: Night = {
    id: uid("night"),
    label: `第 1 次彩排（${formatDay(now)}）`,
    createdAt: now,
    draft: createSampleScript(),
  };
  return { version: 1, activeId: night.id, nights: [night] };
}

export default function App() {
  const [store, setStore] = useState<Persist>(initialState);
  const [viewingShow, setViewingShow] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [repaintIds, setRepaintIds] = useState<string[]>([]);
  const [playhead, setPlayhead] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const activeNight = store.nights.find((n) => n.id === store.activeId) ?? store.nights[0];
  const readOnly = viewingShow;
  /** 当前正在看的脚本：演出值只读，或当晚草稿 */
  const script: Script = viewingShow && activeNight.show ? activeNight.show.script : activeNight.draft;

  const schedule = useMemo(() => computeSchedule(script), [script]);
  const selectedEntry: Entry | null =
    script.entries.find((e) => e.id === selectedId) ?? null;

  // 持久化：任何草稿改动都自动落盘；旧草稿与演出值互不覆盖
  useEffect(() => {
    savePersist(store);
  }, [store]);

  // 播放循环
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const playheadRef = useRef<number>(0);
  useEffect(() => {
    if (!playing) return;
    lastTickRef.current = performance.now();
    if (playhead === null || playhead >= schedule.totalMs) {
      playheadRef.current = 0;
      setPlayhead(0);
    } else {
      playheadRef.current = playhead;
    }
    const tick = (now: number) => {
      const dt = now - lastTickRef.current;
      lastTickRef.current = now;
      const next = playheadRef.current + dt;
      if (next >= schedule.totalMs) {
        playheadRef.current = schedule.totalMs;
        setPlayhead(schedule.totalMs);
        setPlaying(false);
        return;
      }
      playheadRef.current = next;
      setPlayhead(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, schedule.totalMs]);

  const updateDraft = (fn: (s: Script) => Script) => {
    setStore((prev) => ({
      ...prev,
      nights: prev.nights.map((n) =>
        n.id === prev.activeId ? { ...n, draft: fn(n.draft) } : n
      ),
    }));
  };

  const flashRepaint = (ids: string[]) => {
    setRepaintIds(ids);
    window.setTimeout(() => setRepaintIds([]), 1200);
  };

  /** 换位：候选版本完整可播放才落盘，否则停在上一版并提示 */
  const handleMove = (fromIndex: number, toIndex: number) => {
    if (readOnly) return;
    const result = moveSegment(activeNight.draft, fromIndex, toIndex);
    if (!result.ok) {
      if (result.problem) setFlash({ problem: result.problem, reason: "move", at: Date.now() });
      return;
    }
    setFlash(null);
    updateDraft(() => result.script!);
    flashRepaint(result.script!.entries.filter((e) => e.kind === "segment").map((e) => e.id));
  };

  const updateSegment = (id: string, patch: Partial<Segment>) => {
    if (readOnly) return;
    const candidate = cloneScript(activeNight.draft);
    const idx = candidate.entries.findIndex((e) => e.id === id);
    if (idx < 0) return;
    candidate.entries[idx] = { ...(candidate.entries[idx] as Segment), ...patch };
    const problem = findProblems(candidate);
    if (problem) {
      setFlash({ problem: { ...problem, movedId: id }, reason: "edit", at: Date.now() });
      return;
    }
    setFlash(null);
    updateDraft(() => candidate);
  };

  const deleteSegment = (id: string) => {
    if (readOnly) return;
    setFlash(null);
    updateDraft((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  };

  const addSegmentAfter = (afterId: string | null) => {
    if (readOnly) return;
    const seg: Segment = {
      kind: "segment",
      id: uid("s"),
      name: "新增段落",
      model: "冷焰火",
      caliber: "—",
      angleDeg: 90,
      durationMs: 5000,
      safetyM: 8,
      point: "A",
    };
    const entries = [...activeNight.draft.entries];
    if (!afterId) entries.push(seg);
    else entries.splice(entries.findIndex((e) => e.id === afterId) + 1, 0, seg);
    const candidate: Script = { entries };
    const problem = findProblems(candidate);
    if (problem) {
      setFlash({ problem: { ...problem, movedId: seg.id }, reason: "edit", at: Date.now() });
      return;
    }
    setFlash(null);
    updateDraft(() => candidate);
    setSelectedId(seg.id);
  };

  const updateAnchor = (id: string, patch: Partial<MusicAnchor>) => {
    if (readOnly) return;
    const candidate = cloneScript(activeNight.draft);
    const idx = candidate.entries.findIndex((e) => e.id === id);
    if (idx < 0) return;
    candidate.entries[idx] = { ...(candidate.entries[idx] as MusicAnchor), ...patch };
    const problem = findProblems(candidate);
    if (problem) {
      setFlash({ problem: { ...problem, movedId: id }, reason: "edit", at: Date.now() });
      return;
    }
    setFlash(null);
    updateDraft(() => candidate);
  };

  const deleteAnchor = (id: string) => {
    if (readOnly) return;
    setFlash(null);
    updateDraft((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  };

  const addAnchor = (name: string, timeMs: number) => {
    if (readOnly) return;
    const anchor: MusicAnchor = { kind: "anchor", id: uid("a"), name, timeMs };
    // 按时刻插到“第一个开始时刻 >= 锚点时刻”的段落之前，段落相对顺序不变
    const entries = [...activeNight.draft.entries];
    let pos = entries.length;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].kind !== "segment") continue;
      const t = schedule.timed.find((tm) => tm.entry.id === entries[i].id);
      if (t && t.startMs >= timeMs) {
        pos = i;
        break;
      }
    }
    const candidate: Script = { entries: [...entries.slice(0, pos), anchor, ...entries.slice(pos)] };
    const problem = findProblems(candidate);
    if (problem) {
      setFlash({ problem: { ...problem, movedId: anchor.id }, reason: "edit", at: Date.now() });
      return;
    }
    setFlash(null);
    updateDraft(() => candidate);
    setSelectedId(anchor.id);
  };

  /** 确认脚本 → 另存当晚演出值，并自动开出下一场彩排（从演出值复制），旧草稿保留 */
  const confirmShow = () => {
    if (readOnly) return;
    if (!schedule.playable) {
      const p = findProblems(activeNight.draft);
      if (p) setFlash({ problem: p, reason: "edit", at: Date.now() });
      return;
    }
    const now = Date.now();
    const no = nextRehearsalNo(store.nights);
    setStore((prev) => {
      const nights = prev.nights.map((n) =>
        n.id === prev.activeId
          ? { ...n, show: { at: now, script: cloneScript(n.draft) } }
          : n
      );
      const source = nights.find((n) => n.id === prev.activeId)!;
      const nextNight: Night = {
        id: uid("night"),
        label: `第 ${no} 次彩排（源自${formatDay(now)}演出值）`,
        createdAt: now,
        draft: cloneScript(source.show!.script),
      };
      return { ...prev, activeId: nextNight.id, nights: [...nights, nextNight] };
    });
    setViewingShow(false);
    setSelectedId(null);
    setPlayhead(null);
    setFlash(null);
    setNotice(
      `已另存「${formatDay(now)} 当晚演出值」（只读快照），并已从该演出值复制出第 ${no} 次彩排；上一场草稿原样保留。`
    );
    window.setTimeout(() => setNotice(null), 6000);
  };

  const switchNight = (id: string) => {
    if (id === store.activeId) return;
    setStore((prev) => ({ ...prev, activeId: id }));
    setViewingShow(false);
    setSelectedId(null);
    setPlayhead(null);
    setFlash(null);
  };

  const viewShow = (id: string) => {
    setStore((prev) => ({ ...prev, activeId: id }));
    setViewingShow(true);
    setSelectedId(null);
    setPlayhead(null);
    setFlash(null);
  };

  const viewDraft = () => {
    setViewingShow(false);
    setPlayhead(null);
  };

  /** 从某场演出值复制出新彩排 */
  const forkFromShow = (id: string) => {
    const src = store.nights.find((n) => n.id === id);
    if (!src?.show) return;
    const now = Date.now();
    const no = nextRehearsalNo(store.nights);
    const night: Night = {
      id: uid("night"),
      label: `第 ${no} 次彩排（源自${formatDay(src.show.at)}演出值）`,
      createdAt: now,
      draft: cloneScript(src.show.script),
    };
    setStore((prev) => ({ ...prev, activeId: night.id, nights: [...prev.nights, night] }));
    setViewingShow(false);
    setSelectedId(null);
    setPlayhead(null);
  };

  const resetSample = () => {
    if (!window.confirm("载入内置示例会新开一场彩排，已有场次不受影响，确定继续？")) return;
    const now = Date.now();
    const no = nextRehearsalNo(store.nights);
    const night: Night = {
      id: uid("night"),
      label: `第 ${no} 次彩排（示例脚本 ${formatDay(now)}）`,
      createdAt: now,
      draft: createSampleScript(),
    };
    setStore((prev) => ({ ...prev, activeId: night.id, nights: [...prev.nights, night] }));
    setViewingShow(false);
    setSelectedId(null);
    setPlayhead(null);
    setFlash(null);
  };

  // 指标
  const segCount = script.entries.filter((e) => e.kind === "segment").length;
  const conflictCount = flash ? flash.problem.blockedIds.length : schedule.timed.filter((t) => t.overflow).length;
  const minSafety = schedule.timed.length
    ? Math.min(...schedule.timed.map((t) => t.entry.safetyM))
    : 0;

  const anchorById = (id: string) =>
    script.entries.find((e): e is MusicAnchor => e.kind === "anchor" && e.id === id);
  const segById = (id: string) =>
    script.entries.find((e): e is Segment => e.kind === "segment" && e.id === id);

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <p className="kicker">hxyfront-62008 · 烟花燃放脚本编排</p>
          <h1>演出脚本彩排台</h1>
          <p className="sub">
            当前场次：<b>{activeNight.label}</b>
            {viewingShow ? <em className="mode-tag mode-show">只读 · 当晚演出值</em> : <em className="mode-tag mode-draft">彩排草稿（自动保存）</em>}
          </p>
        </div>
        <div className="top-actions">
          <button onClick={() => setShowVersions((v) => !v)}>
            场次与版本（{store.nights.length}）
          </button>
          <button onClick={resetSample}>载入示例</button>
          <button className="primary" disabled={readOnly || !schedule.playable} onClick={confirmShow}>
            ✓ 确认脚本 · 另存当晚演出值
          </button>
        </div>
      </header>

      {showVersions && (
        <section className="panel versions-fold">
          <VersionPanel
            nights={store.nights}
            activeId={activeNight.id}
            viewingShow={viewingShow}
            onSwitch={switchNight}
            onViewDraft={viewDraft}
            onViewShow={viewShow}
            onFork={forkFromShow}
          />
        </section>
      )}

      <section className="metrics">
        <article><small>节目段落</small><strong>{segCount}</strong></article>
        <article><small>点火节点</small><strong>{schedule.timed.length}</strong></article>
        <article><small>冲突提示</small><strong className={conflictCount ? "bad-num" : ""}>{conflictCount}</strong></article>
        <article><small>最近安全距离</small><strong>{minSafety}m</strong></article>
      </section>

      {notice && (
        <section className="notice-banner">
          <span>✓</span>
          <p>{notice}</p>
          <button className="mini" onClick={() => setNotice(null)}>知道了</button>
        </section>
      )}

      {flash && <ConflictBanner flash={flash} anchorName={anchorById(flash.problem.anchorId)?.name} movedName={segById(flash.problem.movedId)?.name} blockedNames={flash.problem.blockedIds.map((id) => segById(id)?.name ?? "—")} onDismiss={() => setFlash(null)} />}

      <section className="panel">
        <div className="heading">
          <div>
            <p>整场节目预览</p>
            <h2>时间轴 · 音乐锚点固定，换位后自动重排点火窗口</h2>
          </div>
          <div className="play-controls">
            <button
              className="primary"
              disabled={!schedule.playable}
              onClick={() => {
                if (playing) {
                  setPlaying(false);
                } else {
                  if (playhead === null || playhead >= schedule.totalMs) setPlayhead(0);
                  setPlaying(true);
                }
              }}
            >
              {playing ? "⏸ 暂停" : "▶ 播放预览"}
            </button>            <button
              onClick={() => {
                setPlaying(false);
                setPlayhead(null);
              }}
            >
              ⏹ 复位
            </button>
          </div>
        </div>
        <Timeline
          schedule={schedule}
          playheadMs={playhead}
          playing={playing}
          movedId={flash?.problem.movedId}
          blockedIds={flash?.problem.blockedIds}
        />
      </section>

      <section className="work-grid">
        <section className="panel">
          <div className="heading">
            <div>
              <p>节目段落 / 音乐锚点</p>
              <h2>演出脚本（拖拽或 ↑↓ 换位）</h2>
            </div>
          </div>
          <ScriptList
            script={script}
            schedule={schedule}
            selectedId={selectedId}
            readOnly={readOnly}
            movedId={flash?.problem.movedId}
            blockedIds={flash?.problem.blockedIds}
            onSelect={setSelectedId}
            onMove={handleMove}
            onAddSegmentAfter={addSegmentAfter}
            onDeleteSegment={deleteSegment}
            onDeleteAnchor={deleteAnchor}
          />
          {!readOnly && (
            <div className="anchor-add">
              <AddAnchorForm onAdd={addAnchor} />
            </div>
          )}
        </section>

        <aside className="side-col">
          <section className="panel">
            <p className="heading-kicker">字段编辑</p>
            {selectedEntry?.kind === "segment" && (
              <SegmentInspector
                segment={selectedEntry}
                readOnly={readOnly}
                blocked={flash?.problem.blockedIds.includes(selectedEntry.id) ?? false}
                onUpdate={(patch) => updateSegment(selectedEntry.id, patch)}
              />
            )}
            {selectedEntry?.kind === "anchor" && (
              <AnchorInspector
                anchor={selectedEntry}
                readOnly={readOnly}
                onUpdate={(patch) => updateAnchor(selectedEntry.id, patch)}
              />
            )}
            {!selectedEntry && (
              <p className="empty-hint">点击左侧段落或锚点编辑。点火时间由顺序自动排定，无需逐条手填；锚点时刻保持固定。</p>
            )}
            {readOnly && (
              <p className="field-hint info-box">
                正在查看当晚演出值（只读快照，不可改动）。点顶部“场次与版本”里该场的“从此续排”，可复制为新彩排后继续调整。
              </p>
            )}
          </section>

          <section className="panel">
            <p className="heading-kicker">燃放点位平面图</p>
            <PointMap schedule={schedule} playheadMs={playhead} selectedId={selectedId} onSelect={setSelectedId} />
          </section>

          <section className="panel">
            <p className="heading-kicker">型号清单</p>
            <Inventory schedule={schedule} />
          </section>
        </aside>
      </section>

      <footer className="foot-note">
        {repaintIds.length > 0 && <em className="repaint-toast">已从改动段到下一音乐锚点重新排点，锚点时刻未变</em>}
        <span>换位若把点火窗口推过锚点，将停在上一个可完整播放的版本并标出前移段 / 受阻段。</span>
      </footer>
    </main>
  );
}

function ConflictBanner({
  flash,
  anchorName,
  movedName,
  blockedNames,
  onDismiss,
}: {
  flash: Flash;
  anchorName?: string;
  movedName?: string;
  blockedNames: string[];
  onDismiss: () => void;
}) {
  const { problem } = flash;
  return (
    <section className="conflict-banner">
      <div className="cb-icon">⛔</div>
      <div className="cb-body">
        <h3>
          {flash.reason === "move"
            ? "换位被阻止：点火窗口越过音乐锚点"
            : "修改被阻止：点火窗口越过音乐锚点"}
        </h3>
        <p>
          前移段 <b className="cb-moved">{movedName ?? "—"}</b> 重排后，受阻段{" "}
          <b className="cb-blocked">{blockedNames.join("、")}</b> 的点火窗口结束于{" "}
          <b>{formatTime(problem.endMs)}</b>，超过音乐锚点
          <b> {anchorName ?? "下一锚点"}</b> 的固定时刻 <b>{formatTime(problem.anchorMs)}</b>。
        </p>
        <p className="cb-sub">预览与时间轴保留在上一个可完整播放的版本，本次改动未落盘。请调整顺序或段落时长后重试。</p>
      </div>
      <button className="mini" onClick={onDismiss}>知道了</button>
    </section>
  );
}
