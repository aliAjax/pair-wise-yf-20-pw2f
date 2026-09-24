import { useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";
import {
  Conflict,
  Draft,
  FIREWORK_TYPES,
  Script,
  Segment,
  Snapshot,
  TimedSegment,
  cloneScript,
  defaultScript,
  fmtClock,
  fmtDate,
  fmtTime,
  loadDraft,
  loadShows,
  parseTime,
  saveDraft,
  saveShows,
  schedule,
  uid,
} from "./lib/script";

const TYPE_COLORS: Record<string, string> = {
  礼花弹: "#dc2626",
  罗马烛光: "#f59e0b",
  扇形架: "#1d4ed8",
  冷焰火: "#0d9488",
};
const typeColor = (t: string) => TYPE_COLORS[t] ?? "#64748b";

interface MoveInfo {
  forwardId: string; // 换位中提前到更前位置的段落（前移段）
  from: number; // 重新排点范围 [from, to)
  to: number;
}

interface InitialState {
  script: Script;
  lastValid: Script;
  shows: Snapshot[];
  draft: Draft | null;
  baseline: string;
}

/** 打开页面时：优先从最新演出值继续彩排，其次草稿，最后示例脚本 */
function loadInitial(): InitialState {
  const shows = loadShows();
  const draft = loadDraft();
  if (shows.length > 0) {
    const latest = shows[shows.length - 1];
    return {
      script: cloneScript(latest.script),
      lastValid: cloneScript(latest.script),
      shows,
      draft,
      baseline: `已从演出值「${latest.name}」继续彩排`,
    };
  }
  if (draft) {
    return {
      script: cloneScript(draft.script),
      lastValid: cloneScript(draft.lastValid),
      shows,
      draft,
      baseline: "已载入上次自动保存的彩排草稿",
    };
  }
  const fresh = defaultScript();
  return {
    script: fresh,
    lastValid: cloneScript(fresh),
    shows,
    draft,
    baseline: "已载入示例脚本，可直接上下换位彩排",
  };
}

function App() {
  const [initial] = useState(loadInitial);
  const [script, setScript] = useState<Script>(initial.script);
  const [lastValid, setLastValid] = useState<Script>(initial.lastValid);
  const [shows, setShows] = useState<Snapshot[]>(initial.shows);
  const [draft, setDraft] = useState<Draft | null>(initial.draft);
  const [lastMove, setLastMove] = useState<MoveInfo | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playT, setPlayT] = useState(0);
  const [speed, setSpeed] = useState(1);

  const { timed, conflicts, total } = useMemo(() => schedule(script), [script]);
  const preview = useMemo(() => schedule(lastValid), [lastValid]);
  const frozen = conflicts.length > 0;

  const nameOf = (id: string) =>
    script.segments.find((s) => s.id === id)?.name ?? "已删除段落";

  // 预览只跟随可完整播放的版本：当前脚本无冲突时才推进
  useEffect(() => {
    if (conflicts.length === 0) setLastValid(script);
  }, [script, conflicts.length]);

  // 草稿自动保存。与载入基准一致时跳过，避免打开页面就覆盖旧草稿
  const lastSavedRef = useRef(
    JSON.stringify({ script: initial.script, lastValid: initial.lastValid })
  );
  useEffect(() => {
    const payload = { script, lastValid };
    const key = JSON.stringify(payload);
    if (key === lastSavedRef.current) return;
    lastSavedRef.current = key;
    const next: Draft = { savedAt: Date.now(), script, lastValid };
    saveDraft(next);
    setDraft(next);
  }, [script, lastValid]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  // 预览播放
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = ((now - last) / 1000) * speed;
      last = now;
      setPlayT((t) => Math.min(preview.total, t + dt));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, preview.total]);

  useEffect(() => {
    if (playing && playT >= preview.total) setPlaying(false);
  }, [playT, playing, preview.total]);

  useEffect(() => {
    setPlayT((t) => Math.min(t, preview.total));
  }, [preview.total]);

  // 非换位类修改：应用新脚本并清掉换位标记
  const applyScript = (next: Script) => {
    setScript(next);
    setLastMove(null);
  };

  const updateSegment = (id: string, patch: Partial<Segment>) => {
    applyScript({
      ...script,
      segments: script.segments.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  };

  const moveSegment = (id: string, dir: -1 | 1) => {
    const idx = script.segments.findIndex((s) => s.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= script.segments.length) return;
    const segments = [...script.segments];
    [segments[idx], segments[j]] = [segments[j], segments[idx]];
    const forwardId = dir === -1 ? id : segments[idx].id;
    const from = Math.min(idx, j);
    // 从改动段到下一处音乐锚点之间重新排点，锚点本身留在原时刻
    let to = segments.length;
    for (let k = from; k < segments.length; k++) {
      if (segments[k].anchor) {
        to = k;
        break;
      }
    }
    setScript({ ...script, segments });
    setLastMove({ forwardId, from, to });
  };

  const removeSegment = (id: string) => {
    applyScript({ ...script, segments: script.segments.filter((s) => s.id !== id) });
  };

  const addSegment = () => {
    const seg: Segment = {
      id: uid(),
      name: `新段落 ${script.segments.length + 1}`,
      type: activeType ?? "礼花弹",
      caliber: "75mm",
      angle: 75,
      duration: 20,
      safety: 50,
      anchor: false,
      anchorTime: 0,
    };
    applyScript({ ...script, segments: [...script.segments, seg] });
  };

  // 确认脚本：另存为当晚演出值快照，草稿保持不动
  const confirmShow = () => {
    if (frozen) return;
    const now = Date.now();
    let name = `${fmtDate(now)} 演出值`;
    if (shows.some((s) => s.name === name)) name = `${name} ${fmtClock(now)}`;
    const snap: Snapshot = { id: uid(), name, savedAt: now, script: cloneScript(script) };
    const next = [...shows, snap];
    setShows(next);
    saveShows(next);
    setNotice(`已另存当晚演出值「${name}」，旧草稿保留未动，再次打开将从此处继续彩排`);
  };

  const restoreDraft = () => {
    if (!draft) return;
    setScript(cloneScript(draft.script));
    setLastValid(cloneScript(draft.lastValid));
    setLastMove(null);
    setNotice("已载入自动保存的彩排草稿");
  };

  const restoreShow = (snap: Snapshot) => {
    setScript(cloneScript(snap.script));
    setLastValid(cloneScript(snap.script));
    setLastMove(null);
    setNotice(`已载入演出值「${snap.name}」，可继续彩排`);
  };

  const anchorCount = script.segments.filter((s) => s.anchor).length;
  const maxSafety = script.segments.reduce((m, s) => Math.max(m, s.safety), 0);
  const currentSeg = preview.timed.find((s) => playT >= s.start && playT < s.end);

  const ticks: number[] = [];
  if (preview.total > 0) {
    for (let t = 0; t <= preview.total; t += 30) ticks.push(t);
    if (preview.total % 30 !== 0) ticks.push(preview.total);
  }

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62008 · 源提示词10 · Port 62008</p>
        <h1>烟花燃放脚本编排</h1>
        <span>
          面向彩排的演出脚本：上下换位后自动从改动段到下一处音乐锚点重新排点，锚点时刻锁定不动；
          若重排把点火窗口推到锚点之后，会标出前移段与受阻段，预览停留在上一可完整播放版本。
          确认脚本后另存当晚演出值，再次打开即可从演出值继续彩排，旧草稿不被覆盖。
        </span>
        <div className="baseline">{initial.baseline}</div>
      </section>

      <section className="metrics">
        <article>
          <small>节目段落</small>
          <strong>{script.segments.length}</strong>
        </article>
        <article>
          <small>音乐锚点</small>
          <strong>{anchorCount}</strong>
        </article>
        <article className={frozen ? "danger" : ""}>
          <small>冲突提示</small>
          <strong>{conflicts.length}</strong>
        </article>
        <article>
          <small>最大安全距离</small>
          <strong>{maxSafety}m</strong>
        </article>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>演出脚本 · 顺序可调</p>
            <h2>彩排脚本</h2>
          </div>
          <div className="toolbar">
            <label className="gap-field">
              <span>串场间隔(秒)</span>
              <input
                type="number"
                min={0}
                max={300}
                value={script.gap}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isNaN(v))
                    applyScript({ ...script, gap: Math.max(0, Math.min(300, v)) });
                }}
              />
            </label>
            <button onClick={addSegment}>＋ 新增段落</button>
            <button
              className="primary"
              disabled={frozen}
              title={frozen ? "存在锚点冲突，解除后才能另存演出值" : "确认当前脚本并另存为当晚演出值"}
              onClick={confirmShow}
            >
              确认脚本 · 另存当晚演出值
            </button>
          </div>
        </div>

        <div className="chips">
          <span className="chips-label">型号高亮</span>
          {FIREWORK_TYPES.map((t) => (
            <button
              key={t}
              className={activeType === t ? "chip on" : "chip"}
              onClick={() => setActiveType(activeType === t ? null : t)}
            >
              {t}
            </button>
          ))}
        </div>

        {frozen && (
          <div className="conflict-banner">
            <strong>⚠ 重排冲突</strong>
            {lastMove && <p>前移段「{nameOf(lastMove.forwardId)}」换位提前后：</p>}
            <ul>
              {conflicts.map((c) => (
                <li key={`${c.blockedId}-${c.anchorId}`}>
                  受阻段「{nameOf(c.blockedId)}」点火窗口 {fmtTime(c.blockedStart)} →{" "}
                  {fmtTime(c.blockedEnd)} 被推到锚点「{nameOf(c.anchorId)}」@{" "}
                  {fmtTime(c.anchorTime)} 之后
                </li>
              ))}
            </ul>
            <p>请换回顺序或缩短时长；预览与「另存演出值」已锁定在上一可完整播放版本。</p>
          </div>
        )}

        {!frozen && lastMove && (
          <div className="reschedule-line">
            已从「{script.segments[lastMove.from]?.name}」到
            {lastMove.to < script.segments.length
              ? `锚点「${script.segments[lastMove.to]?.name}」`
              : "末尾"}
            之间重新排点（{lastMove.to - lastMove.from} 段），锚点时刻未动。
          </div>
        )}

        <div className="segments">
          {timed.map((seg, i) => (
            <SegmentCard
              key={seg.id}
              seg={seg}
              index={i}
              isFirst={i === 0}
              isLast={i === timed.length - 1}
              isForward={lastMove?.forwardId === seg.id}
              inRange={lastMove !== null && i >= lastMove.from && i < lastMove.to}
              conflict={conflicts.find((c) => c.blockedId === seg.id)}
              dimmed={activeType !== null && seg.type !== activeType}
              onMove={(dir) => moveSegment(seg.id, dir)}
              onRemove={() => removeSegment(seg.id)}
              onChange={(patch) => updateSegment(seg.id, patch)}
              onInvalidTime={() => setNotice("锚点时刻格式无效，请使用 mm:ss，例如 01:30")}
            />
          ))}
          {timed.length === 0 && <p className="empty">暂无段落，点击「新增段落」开始编排。</p>}
        </div>
      </section>

      <section className="panel preview-panel">
        <div className="heading">
          <div>
            <p>整场节目预览</p>
            <h2>
              时间轴 {frozen && <span className="frozen-tag">已冻结在上一可播放版本</span>}
            </h2>
          </div>
          <div className="player">
            <span className="now-playing">当前：{currentSeg ? currentSeg.name : "—"}</span>
            <button
              className="primary"
              disabled={preview.timed.length === 0}
              onClick={() => {
                if (!playing && playT >= preview.total) setPlayT(0);
                setPlaying(!playing);
              }}
            >
              {playing ? "暂停" : "播放"}
            </button>
            <button
              onClick={() => {
                setPlaying(false);
                setPlayT(0);
              }}
            >
              复位
            </button>
            <button onClick={() => setSpeed(speed === 1 ? 8 : 1)}>{speed}×</button>
            <span className="clock">
              {fmtTime(playT)} / {fmtTime(preview.total)}
            </span>
          </div>
        </div>

        {frozen && (
          <div className="frozen-banner">
            当前顺序存在锚点冲突，预览停留在前一可完整播放版本；解除冲突后自动恢复为最新版本。
          </div>
        )}

        {preview.timed.length > 0 ? (
          <div className="timeline">
            <div className="lane ruler">
              <span className="lane-name">时间</span>
              <div className="lane-track">
                {ticks.map((t) => (
                  <i
                    key={t}
                    className="tick"
                    style={{ left: `${(t / preview.total) * 100}%` }}
                  >
                    <span>{fmtTime(t)}</span>
                  </i>
                ))}
                <div
                  className="playhead"
                  style={{ left: `${(playT / preview.total) * 100}%` }}
                />
              </div>
            </div>
            {preview.timed.map((seg) => (
              <div
                key={seg.id}
                className={currentSeg?.id === seg.id ? "lane now" : "lane"}
              >
                <span className="lane-name" title={seg.name}>
                  {seg.name}
                </span>
                <div className="lane-track">
                  <div
                    className="bar"
                    style={{
                      left: `${(seg.start / preview.total) * 100}%`,
                      width: `${Math.max((seg.duration / preview.total) * 100, 0.6)}%`,
                      background: typeColor(seg.type),
                    }}
                    title={`${seg.name} · ${fmtTime(seg.start)} → ${fmtTime(seg.end)}`}
                  >
                    <span>{fmtTime(seg.start)}</span>
                  </div>
                  {seg.anchor && (
                    <i
                      className="flag"
                      style={{ left: `${(seg.start / preview.total) * 100}%` }}
                      title={`音乐锚点 · 时刻锁定 ${fmtTime(seg.start)}`}
                    >
                      ⚑
                    </i>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty">暂无段落可预览。</p>
        )}
      </section>

      <section className="grid-2">
        <div className="panel">
          <div className="heading">
            <div>
              <p>型号清单</p>
              <h2>烟花型号汇总</h2>
            </div>
          </div>
          {FIREWORK_TYPES.map((t) => {
            const segs = timed.filter((s) => s.type === t);
            if (segs.length === 0) return null;
            const dur = segs.reduce((a, s) => a + s.duration, 0);
            const safety = segs.reduce((m, s) => Math.max(m, s.safety), 0);
            return (
              <div className="model-row" key={t}>
                <i className="dot" style={{ background: typeColor(t) }} />
                <strong>{t}</strong>
                <span>
                  {segs.length} 段 · 合计 {fmtTime(dur)} · 最大安全距离 {safety}m
                </span>
              </div>
            );
          })}
        </div>

        <div className="panel">
          <div className="heading">
            <div>
              <p>本地存档</p>
              <h2>草稿与演出值</h2>
            </div>
          </div>
          <div className="archive-row">
            <div>
              <strong>彩排草稿 · 自动保存</strong>
              <p>
                {draft
                  ? `最近保存 ${fmtDate(draft.savedAt)} ${fmtClock(draft.savedAt)} · ${
                      draft.script.segments.length
                    } 段`
                  : "暂无草稿"}
              </p>
            </div>
            <button disabled={!draft} onClick={restoreDraft}>
              载入草稿
            </button>
          </div>
          <p className="archive-note">当晚演出值 · 确认后另存快照，旧版本不被覆盖：</p>
          {shows.length === 0 && (
            <p className="empty">暂无演出值。确认脚本后在此生成，再次打开自动从最新演出值继续彩排。</p>
          )}
          {[...shows].reverse().map((s) => (
            <div className="archive-row" key={s.id}>
              <div>
                <strong>{s.name}</strong>
                <p>
                  保存于 {fmtClock(s.savedAt)} · {s.script.segments.length} 段 · 总时长{" "}
                  {fmtTime(schedule(s.script).total)}
                </p>
              </div>
              <button onClick={() => restoreShow(s)}>载入</button>
            </div>
          ))}
        </div>
      </section>

      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}

function SegmentCard(props: {
  seg: TimedSegment;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  isForward: boolean;
  inRange: boolean;
  conflict?: Conflict;
  dimmed: boolean;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onChange: (patch: Partial<Segment>) => void;
  onInvalidTime: () => void;
}) {
  const { seg } = props;
  const [anchorText, setAnchorText] = useState(fmtTime(seg.anchorTime));
  useEffect(() => {
    setAnchorText(fmtTime(seg.anchorTime));
  }, [seg.anchorTime, seg.anchor]);

  const commitAnchor = () => {
    const v = parseTime(anchorText);
    if (v === null) {
      setAnchorText(fmtTime(seg.anchorTime));
      props.onInvalidTime();
    } else {
      props.onChange({ anchorTime: v });
    }
  };

  const numField =
    (field: "angle" | "duration" | "safety") =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value);
      if (Number.isNaN(v)) return;
      props.onChange({ [field]: field === "duration" ? Math.max(1, v) : Math.max(0, v) });
    };

  const cls = [
    "segment",
    props.conflict ? "blocked" : "",
    props.isForward ? "forward" : "",
    props.dimmed ? "dimmed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={cls}>
      <header>
        <div className="move-btns">
          <button disabled={props.isFirst} title="上移一段" onClick={() => props.onMove(-1)}>
            ↑
          </button>
          <button disabled={props.isLast} title="下移一段" onClick={() => props.onMove(1)}>
            ↓
          </button>
        </div>
        <b className="ord">{String(props.index + 1).padStart(2, "0")}</b>
        <input
          className="name"
          value={seg.name}
          onChange={(e) => props.onChange({ name: e.target.value })}
        />
        <div className="badges">
          {seg.anchor && <span className="badge anchor">锚点 🔒 {fmtTime(seg.anchorTime)}</span>}
          {props.isForward && <span className="badge forward">前移段</span>}
          {props.conflict && <span className="badge blocked">受阻段</span>}
          {props.inRange && <span className="badge reranged">已重排</span>}
        </div>
        <span className="window">
          {seg.anchor ? "锚定" : "点火"} {fmtTime(seg.start)} → {fmtTime(seg.end)}
        </span>
        <button className="del" title="删除段落" onClick={props.onRemove}>
          ✕
        </button>
      </header>
      <div className="fields">
        <label>
          <span>烟花型号</span>
          <select value={seg.type} onChange={(e) => props.onChange({ type: e.target.value })}>
            {FIREWORK_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          <span>口径</span>
          <input value={seg.caliber} onChange={(e) => props.onChange({ caliber: e.target.value })} />
        </label>
        <label>
          <span>发射角度°</span>
          <input type="number" value={seg.angle} onChange={numField("angle")} />
        </label>
        <label>
          <span>持续(秒)</span>
          <input type="number" min={1} value={seg.duration} onChange={numField("duration")} />
        </label>
        <label>
          <span>安全距离m</span>
          <input type="number" min={0} value={seg.safety} onChange={numField("safety")} />
        </label>
        <label className="anchor-toggle">
          <span>音乐锚点</span>
          <input
            type="checkbox"
            checked={seg.anchor}
            onChange={(e) =>
              props.onChange(
                e.target.checked
                  ? { anchor: true, anchorTime: seg.start } // 钉在当前时刻，时间轴不跳变
                  : { anchor: false }
              )
            }
          />
        </label>
        {seg.anchor && (
          <label>
            <span>锚点时刻 mm:ss</span>
            <input
              value={anchorText}
              onChange={(e) => setAnchorText(e.target.value)}
              onBlur={commitAnchor}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          </label>
        )}
      </div>
    </article>
  );
}

export default App;
