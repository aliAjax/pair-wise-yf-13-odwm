import { useStore } from "../lib/store";
import { formatTime } from "../lib/helpers";

export default function DraftBanner() {
  const { drafts, retryDraft, retryAllDrafts, discardDraft, discardAllDrafts } = useStore();

  if (drafts.length === 0) return null;

  return (
    <section className="panel draft-banner">
      <div className="heading">
        <div>
          <p>保存失败兜底</p>
          <h2>有 {drafts.length} 项待提交草稿</h2>
        </div>
        <div className="btn-row">
          <button className="primary" onClick={retryAllDrafts}>
            全部重试
          </button>
          <button onClick={discardAllDrafts}>全部放弃</button>
        </div>
      </div>
      <ul className="draft-list">
        {drafts.map((draft) => (
          <li key={draft.id}>
            <div>
              <strong>{draft.description}</strong>
              <span>保存于 {formatTime(draft.createdAt)} · 重试时将与其他标签页的最新数据合并</span>
            </div>
            <div className="btn-row">
              <button className="primary" onClick={() => retryDraft(draft.id)}>
                重试
              </button>
              <button onClick={() => discardDraft(draft.id)}>放弃</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
