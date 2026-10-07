import { useState } from "react";
import { useStore } from "../lib/store";
import { formatTime } from "../lib/helpers";

export default function ShiftBar() {
  const { shifts, activeShiftId, setActiveShift, handover, startFirstShift, pendingIds } = useStore();
  const [note, setNote] = useState("");

  const sorted = [...shifts].sort((a, b) => a.startAt - b.startAt);
  const active = sorted.find((shift) => shift.id === activeShiftId) ?? null;

  if (sorted.length === 0) {
    return (
      <section className="panel shift-bar">
        <div className="heading">
          <div>
            <p>值班班次</p>
            <h2>开始值班</h2>
          </div>
          <button className="primary" onClick={startFirstShift}>
            新建首个班次
          </button>
        </div>
        <p className="empty-tip">还没有班次记录。新建班次后即可录入机舱参数与异常巡检项，数据保存在本浏览器本地。</p>
      </section>
    );
  }

  const handleHandover = () => {
    if (!active) return;
    handover(active.id, note);
    setNote("");
  };

  return (
    <section className="panel shift-bar">
      <div className="heading">
        <div>
          <p>值班班次</p>
          <h2>班次切换与交接班</h2>
        </div>
      </div>

      <div className="shift-tabs">
        {sorted.map((shift) => (
          <button
            key={shift.id}
            className={`shift-tab ${shift.id === activeShiftId ? "active" : ""} ${shift.status === "handed" ? "handed" : ""}`}
            onClick={() => setActiveShift(shift.id)}
          >
            <span className="shift-name">{shift.name}</span>
            <span className="shift-meta">
              {shift.status === "active" ? (
                <i className="dot dot-active" />
              ) : (
                <i className="dot dot-locked" />
              )}
              {shift.status === "active" ? "在岗" : "已锁定"}
              {pendingIds.has(shift.id) && <em className="pending-tag">待提交</em>}
            </span>
          </button>
        ))}
      </div>

      {active && active.status === "active" ? (
        <div className="handover-box">
          <div className="handover-info">
            <strong>{active.name}</strong>
            <span>
              接班于 {formatTime(active.startAt)} · 操作者 {active.updatedBy}
            </span>
          </div>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="交接备注（如：主机工况平稳，注意滑油温度变化）"
          />
          <button className="primary" onClick={handleHandover}>
            交接班并锁定
          </button>
        </div>
      ) : (
        active && (
          <div className="handover-box handed">
            <div className="handover-info">
              <strong>{active.name} 已交接锁定</strong>
              <span>
                交接于 {active.endAt ? formatTime(active.endAt) : "-"} · 接班操作者 {active.updatedBy}
              </span>
              {active.handoverNote && <p className="handover-note">交接备注：{active.handoverNote}</p>}
            </div>
            <span className="lock-tip">锁定后班次记录只读；未处理的异常巡检项已带入新班次继续跟踪。</span>
          </div>
        )
      )}
    </section>
  );
}
