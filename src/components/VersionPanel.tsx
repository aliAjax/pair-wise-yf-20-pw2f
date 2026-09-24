import type { Night } from "../types";
import { formatDate } from "../time";

interface Props {
  nights: Night[];
  activeId: string;
  viewingShow: boolean;
  onSwitch: (id: string) => void;
  onViewDraft: () => void;
  onViewShow: (id: string) => void;
  onFork: (id: string) => void;
}

export default function VersionPanel({
  nights,
  activeId,
  viewingShow,
  onSwitch,
  onViewDraft,
  onViewShow,
  onFork,
}: Props) {
  return (
    <div className="version-panel">
      <p className="vp-hint">草稿与当晚演出值分开存放：确认脚本后旧草稿保留不动，重开自动从演出值续排。</p>
      {nights.map((n) => {
        const active = n.id === activeId;
        return (
          <article key={n.id} className={["vp-row", active ? "active" : ""].filter(Boolean).join(" ")}>
            <div className="vp-main" onClick={() => onSwitch(n.id)}>
              <strong>{n.label}</strong>
              <span>创建于 {formatDate(n.createdAt)}</span>
              <div className="vp-tags">
                <em className="tag tag-draft">彩排草稿</em>
                {n.show ? <em className="tag tag-show">✓ 当晚演出值 · {formatDate(n.show.at)}</em> : <em className="tag tag-pending">未确认</em>}
              </div>
            </div>
            <div className="vp-actions">
              {n.show && (
                <button
                  className={active && viewingShow ? "mini primary" : "mini"}
                  onClick={() => onViewShow(n.id)}
                >
                  看演出值
                </button>
              )}
              <button
                className={active && !viewingShow ? "mini primary" : "mini"}
                onClick={() => {
                  onSwitch(n.id);
                  onViewDraft();
                }}
              >
                {active ? "正在彩排" : "打开草稿"}
              </button>
              {n.show && (
                <button className="mini" title="从该演出值复制出新一场彩排" onClick={() => onFork(n.id)}>
                  从此续排
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
