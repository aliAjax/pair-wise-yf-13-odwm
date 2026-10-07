import { useState } from "react";
import { useStore } from "../lib/store";
import { ACTION_LABELS, formatTime, latestAction } from "../lib/helpers";
import type { HandlingAction, Inspection } from "../lib/types";

const STATUS_CLASS: Record<HandlingAction, string> = {
  open: "tag-open",
  handling: "tag-handling",
  resolved: "tag-resolved",
  carry: "tag-carry",
};

function InspectionCard({ inspection, locked }: { inspection: Inspection; locked: boolean }) {
  const { addHandling, pendingIds } = useStore();
  const [note, setNote] = useState("");
  const status = latestAction(inspection);

  const submit = (action: HandlingAction) => {
    addHandling(inspection.id, action, note);
    setNote("");
  };

  return (
    <article className="inspection-card">
      <div className="inspection-head">
        <span className="device-badge">{inspection.device}</span>
        <span className={`status-tag ${STATUS_CLASS[status]}`}>{ACTION_LABELS[status]}</span>
        {inspection.carriedFrom && <span className="carry-tag">上一班次带入</span>}
        {pendingIds.has(inspection.id) && <span className="pending-tag">待提交</span>}
      </div>
      <p className="inspection-desc">{inspection.description}</p>

      <ul className="handling-log">
        {inspection.handlings.map((handling) => (
          <li key={handling.id}>
            <span className={`status-tag ${STATUS_CLASS[handling.action]}`}>{ACTION_LABELS[handling.action]}</span>
            <div>
              <strong>{handling.by}</strong>
              <span>{handling.note}</span>
            </div>
            <em>{formatTime(handling.at)}</em>
          </li>
        ))}
      </ul>

      {!locked && status !== "resolved" && (
        <div className="handling-actions">
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="处置说明（可空）"
          />
          {status === "open" && (
            <button onClick={() => submit("handling")}>标记处理中</button>
          )}
          <button className="primary" onClick={() => submit("resolved")}>
            标记已处理
          </button>
        </div>
      )}
    </article>
  );
}

export default function InspectionTimeline({ deviceFilter }: { deviceFilter: string | null }) {
  const { intended, activeShiftId } = useStore();

  const items = intended.inspections
    .filter((inspection) => inspection.shiftId === activeShiftId)
    .filter((inspection) => (deviceFilter ? inspection.device === deviceFilter : true))
    .sort((a, b) => b.createdAt - a.createdAt);

  const shift = intended.shifts.find((item) => item.id === activeShiftId);
  const locked = shift?.status === "handed";

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>异常记录时间线</p>
          <h2>异常巡检项</h2>
        </div>
        <span className="record-count">{items.length} 项</span>
      </div>

      {items.length === 0 ? (
        <p className="empty-tip">本班次暂无异常巡检项。填写记录时输入异常描述即会生成巡检项；未处理项会随交接班带入下一班次。</p>
      ) : (
        <div className="inspection-list">
          {items.map((inspection) => (
            <InspectionCard key={inspection.id} inspection={inspection} locked={locked} />
          ))}
        </div>
      )}
    </section>
  );
}
