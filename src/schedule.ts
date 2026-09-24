import type { Entry, MusicAnchor, Script, Segment } from "./types";

export interface TimedSegment {
  entry: Segment;
  startMs: number;
  endMs: number;
  /** 所属排布块序号 */
  blockIndex: number;
  overflow: boolean;
}

export interface TimedAnchor {
  entry: MusicAnchor;
  /** 该锚点作为第 blockIndex 个块的起点 */
  blockIndex: number;
}

export interface Block {
  index: number;
  /** 块起点：首锚点之前的块为 0，其余为起始锚点时刻 */
  startMs: number;
  /** 块终点：结束锚点时刻；null 表示末尾块，可无限排 */
  endMs: number | null;
  /** 起始锚点（首块可能为 null） */
  startAnchor: MusicAnchor | null;
  /** 结束锚点（末尾块为 null），点火窗口不得越过它 */
  endAnchor: MusicAnchor | null;
  segments: TimedSegment[];
  overflowSegments: TimedSegment[];
}

export interface Schedule {
  blocks: Block[];
  timed: TimedSegment[];
  anchors: TimedAnchor[];
  totalMs: number;
  playable: boolean;
  anchorOrderError: boolean;
}

/**
 * 排布规则：音乐锚点把脚本切成块。
 * 块按“前面有几个锚点”编号：首个锚点之前是块 0（可能没有段落），
 * 块 k（k>=1）从第 k-1 个锚点时刻起排，到第 k 个锚点为止；
 * 最后一个锚点之后是末尾块，无结束锚点，可无限排。
 * 块内段落按顺序首尾相接；锚点固定在原时刻，
 * 点火窗口结束时刻越过结束锚点的段落标为 overflow。
 */
export function computeSchedule(script: Script): Schedule {
  const anchorsList: MusicAnchor[] = script.entries.filter(
    (e): e is MusicAnchor => e.kind === "anchor"
  );

  let anchorOrderError = false;
  for (let i = 1; i < anchorsList.length; i++) {
    if (anchorsList[i].timeMs < anchorsList[i - 1].timeMs) anchorOrderError = true;
  }

  // 逐段排布：块号 = 该段之前出现的锚点数；同块段落首尾相接
  const timed: TimedSegment[] = [];
  const cursorByBlock = new Map<number, number>();
  let anchorsSeen = 0;

  for (const entry of script.entries) {
    if (entry.kind === "anchor") {
      anchorsSeen += 1;
      continue;
    }
    const bi = anchorsSeen; // 块号：0=首锚前，k=第 k 个锚点(下标k-1)之后
    const base = bi === 0 ? 0 : anchorsList[bi - 1].timeMs;
    const cursor = cursorByBlock.get(bi) ?? base;
    const startMs = cursor;
    const endMs = startMs + entry.durationMs;
    const endAnchor = anchorsList[bi] ?? null; // 块 bi 的下一个锚点
    const overflow = endAnchor !== null && endMs > endAnchor.timeMs + 0.001;
    timed.push({ entry, startMs, endMs, blockIndex: bi, overflow });
    cursorByBlock.set(bi, endMs);
  }

  // 建块：块 0..anchorsList.length
  const blocks: Block[] = [];
  for (let i = 0; i <= anchorsList.length; i++) {
    const segs = timed.filter((t) => t.blockIndex === i);
    blocks.push({
      index: i,
      startMs: i === 0 ? 0 : anchorsList[i - 1].timeMs,
      endMs: anchorsList[i]?.timeMs ?? null,
      startAnchor: anchorsList[i - 1] ?? null,
      endAnchor: anchorsList[i] ?? null,
      segments: segs.filter((s) => !s.overflow),
      overflowSegments: segs.filter((s) => s.overflow),
    });
  }

  const anchors: TimedAnchor[] = anchorsList.map((entry, i) => ({ entry, blockIndex: i + 1 }));
  const playable = timed.length > 0 && timed.every((t) => !t.overflow) && !anchorOrderError;
  const totalMs = timed.reduce((max, t) => Math.max(max, t.endMs), 0);

  return { blocks, timed, anchors, totalMs, playable, anchorOrderError };
}

export interface MoveProblem {
  /** 前移段：被用户往前拖/移的段落 */
  movedId: string;
  /** 受阻段：点火窗口被推到锚点之后的段落（可能就是前移段本身） */
  blockedIds: string[];
  /** 被越过的音乐锚点（乱序时为乱序锚点） */
  anchorId: string;
  /** 受阻段点火窗口实际结束时刻 */
  endMs: number;
  /** 锚点固定时刻 */
  anchorMs: number;
  /** 锚点先后顺序错误 */
  orderError?: boolean;
}

export interface MoveResult {
  ok: boolean;
  script?: Script;
  problem?: MoveProblem;
}

/**
 * 把 fromIndex 的段落移到 toIndex（entry 数组的 splice 插入位）。
 * 换位后从改动段到下一处音乐锚点之间重新排点，锚点本身留在原时刻。
 * 若重排把点火窗口推到锚点之后：ok:false，调用方保留上一个可播放版本。
 */
export function moveSegment(script: Script, fromIndex: number, toIndex: number): MoveResult {
  const entries = script.entries;
  const moving = entries[fromIndex];
  if (!moving || moving.kind !== "segment") return { ok: false };
  if (fromIndex === toIndex) return { ok: false };

  const next = [...entries];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);

  const candidate: Script = { entries: next };
  const schedule = computeSchedule(candidate);

  if (schedule.anchorOrderError || schedule.timed.some((t) => t.overflow)) {
    return { ok: false, problem: describeMoveProblem(candidate, schedule, moving.id, fromIndex, toIndex) };
  }
  return { ok: true, script: candidate };
}

function describeMoveProblem(
  candidate: Script,
  schedule: Schedule,
  movedId: string,
  fromIndex: number,
  toIndex: number
): MoveProblem {
  // 锚点乱序（移动段落不会改变锚点顺序，这里仅作兜底）
  if (schedule.anchorOrderError) {
    const bad = schedule.anchors.find((_, i) => {
      if (i === 0) return false;
      return schedule.anchors[i].entry.timeMs < schedule.anchors[i - 1].entry.timeMs;
    });
    const prev = bad ? schedule.anchors[bad.blockIndex - 1] : null;
    return {
      movedId,
      blockedIds: [],
      anchorId: bad?.entry.id ?? "",
      endMs: bad?.entry.timeMs ?? 0,
      anchorMs: prev?.entry.timeMs ?? 0,
      orderError: true,
    };
  }

  const overflow = schedule.timed.filter((t) => t.overflow);
  const firstOverflow = overflow[0];
  // 块的 endAnchor 就是该块点火窗口不得越过的下一处音乐锚点
  const endAnchor =
    schedule.blocks.find((b) => b.index === firstOverflow.blockIndex)?.endAnchor ?? null;
  const lo = Math.min(fromIndex, toIndex);
  const hi = Math.max(fromIndex, toIndex);
  let crossed: MusicAnchor | null = null;
  for (let i = lo; i <= hi && i < candidate.entries.length; i++) {
    const e = candidate.entries[i];
    if (e.kind === "anchor") {
      crossed = e;
      break;
    }
  }

  const anchor = crossed ?? endAnchor;
  return {
    movedId,
    blockedIds: overflow.map((b) => b.entry.id),
    anchorId: anchor?.id ?? "",
    endMs: Math.max(...overflow.map((b) => b.endMs)),
    anchorMs: anchor?.timeMs ?? 0,
  };
}

/** 通用校验：编辑时长 / 新增段落或锚点后检查 */
export function findProblems(script: Script): MoveProblem | null {
  const schedule = computeSchedule(script);
  if (schedule.anchorOrderError) {
    const badIdx = schedule.anchors.findIndex((t, i) => {
      if (i === 0) return false;
      return t.entry.timeMs < schedule.anchors[i - 1].entry.timeMs;
    });
    const bad = schedule.anchors[badIdx];
    const prev = schedule.anchors[badIdx - 1];
    return {
      movedId: bad?.entry.id ?? "",
      blockedIds: [],
      anchorId: bad?.entry.id ?? "",
      endMs: bad?.entry.timeMs ?? 0,
      anchorMs: prev?.entry.timeMs ?? 0,
      orderError: true,
    };
  }
  const overflow = schedule.timed.filter((t) => t.overflow);
  if (overflow.length === 0) return null;
  const block = schedule.blocks.find((b) => b.overflowSegments.length)!;
  return {
    movedId: overflow[0].entry.id,
    blockedIds: overflow.map((b) => b.entry.id),
    anchorId: block.endAnchor?.id ?? "",
    endMs: Math.max(...overflow.map((b) => b.endMs)),
    anchorMs: block.endAnchor?.timeMs ?? 0,
  };
}

export function isSegment(e: Entry): e is Segment {
  return e.kind === "segment";
}
