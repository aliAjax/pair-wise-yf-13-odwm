import { useMemo, useState } from "react";
import type { Inspection, Shift } from "../types";
import { formatTs, INSPECTION_STATUS_LABEL } from "../lib/constants";
import { Badge, Field, Input, Textarea } from "./ui";

interface HandoverDialogProps {
  shift: Shift;
  operator: string;
  carried: Inspection[];
  onClose: () => void;
  onConfirm: (input: {
    newShiftName: string;
    newOperator: string;
    handoverTo: string;
    summary: string;
  }) => void;
}

export function HandoverDialog({
  shift,
  operator,
  carried,
  onClose,
  onConfirm,
}: HandoverDialogProps) {
  const [newShiftName, setNewShiftName] = useState("");
  const [newOperator, setNewOperator] = useState("");
  const [handoverTo, setHandoverTo] = useState("");
  const [summary, setSummary] = useState("");

  const suggestedName = useMemo(() => {
    // 根据「HH-HH班」格式推算下一个 4 小时班次
    const match = shift.name.match(/(\d{1,2})-(\d{1,2})班?/);
    if (!match) return "";
    const start = Number(match[2]);
    const end = (start + 4) % 24;
    return `${String(start).padStart(2, "0")}-${String(end).padStart(2, "0")}班`;
  }, [shift.name]);

  const canConfirm = newShiftName.trim() && newOperator.trim();

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="heading">
          <div>
            <p>班次交接</p>
            <h2>锁定 {shift.name}，开启新班次</h2>
          </div>
          <button className="ghost" onClick={onClose}>
            取消
          </button>
        </div>

        <div className="handover-open">
          <div>
            <span className="muted">当前班次</span>
            <strong>{shift.name}</strong>
            <small>
              {shift.operator} · {formatTs(shift.startedAt)} 起
            </small>
          </div>
          <div className="handover-arrow">→</div>
          <div>
            <span className="muted">新班次</span>
            <strong>{newShiftName.trim() || suggestedName || "待命名"}</strong>
            <small>{newOperator.trim() || "待指定值班员"}</small>
          </div>
        </div>

        <div className="field-grid">
          <Field label="新班次名称">
            <Input
              value={newShiftName}
              placeholder={suggestedName || "如 12-16班"}
              onChange={(e) => setNewShiftName(e.target.value)}
            />
          </Field>
          <Field label="新班次值班轮机员">
            <Input
              value={newOperator}
              placeholder={operator || "接班人姓名"}
              onChange={(e) => setNewOperator(e.target.value)}
            />
          </Field>
          <Field label="交接给（接班人）">
            <Input
              value={handoverTo}
              placeholder="接班人姓名"
              onChange={(e) => setHandoverTo(e.target.value)}
            />
          </Field>
        </div>

        <div className="carry-box">
          <div className="carry-head">
            <h3>将带入新班次的未处理异常（{carried.length}）</h3>
            <Badge tone="orange">自动带入</Badge>
          </div>
          {carried.length === 0 ? (
            <p className="empty">没有未闭环异常，交接干净。</p>
          ) : (
            <ul className="carry-list">
              {carried.map((i) => (
                <li key={i.id}>
                  <span>
                    {i.equipment} · {i.title}
                  </span>
                  <small className="muted">
                    {INSPECTION_STATUS_LABEL[i.status]}
                    {i.handling ? ` · ${i.handling}` : ""}
                  </small>
                </li>
              ))}
            </ul>
          )}
          <Textarea
            rows={2}
            placeholder="可补充交接说明，将记录在旧班次交接摘要中"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </div>

        <div className="form-actions">
          <button
            className="primary danger-primary"
            disabled={!canConfirm}
            onClick={() =>
              onConfirm({
                newShiftName: newShiftName.trim() || suggestedName,
                newOperator: newOperator.trim(),
                handoverTo: handoverTo.trim() || newOperator.trim(),
                summary: summary.trim(),
              })
            }
          >
            确认交接并锁定本班
          </button>
          <span className="hint">交接后旧班次只读，异常处置记录完整保留。</span>
        </div>
      </div>
    </div>
  );
}
