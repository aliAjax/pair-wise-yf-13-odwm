import { useMemo, useState } from "react";
import "./styles.css";
import type {
  FieldConflict,
  Inspection,
  ParamReading,
  PendingOp,
  Shift,
} from "./types";
import { loadOperator, saveOperator, useWatchStore } from "./lib/store";
import { nowTs, uid } from "./lib/storage";
import { formatTs, formatTime } from "./lib/constants";
import { Dashboard } from "./components/Dashboard";
import { ParamForm } from "./components/ParamForm";
import { InspectionForm } from "./components/InspectionForm";
import { Timeline } from "./components/Timeline";
import { HistoryPanel } from "./components/HistoryPanel";
import { ConflictPanel } from "./components/ConflictPanel";
import { HandoverDialog } from "./components/HandoverDialog";
import { Badge } from "./components/ui";

function App() {
  const {
    db,
    draftCount,
    draftSavedAt,
    storageError,
    toast,
    enqueue,
    retry,
  } = useWatchStore();

  const [operator, setOperator] = useState(loadOperator);
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [editingParam, setEditingParam] = useState<ParamReading | null>(null);
  const [editingInsp, setEditingInsp] = useState<Inspection | null>(null);
  const [handoverOpen, setHandoverOpen] = useState(false);

  const activeShift = db.shifts.find((s) => s.status === "active") ?? null;
  const shiftsDesc = [...db.shifts].sort((a, b) => b.startedAt - a.startedAt);
  const currentShift: Shift | null =
    db.shifts.find((s) => s.id === selectedShiftId) ?? activeShift ?? shiftsDesc[0] ?? null;

  const changeOperator = (name: string) => {
    setOperator(name);
    saveOperator(name);
  };

  // ---- 异常项分组：本班登记 vs 上一班带入 ----
  const { carriedOver, currentInspections, openCarried } = useMemo(() => {
    if (!currentShift) {
      return { carriedOver: [], currentInspections: [], openCarried: [] };
    }
    const carried = db.inspections.filter(
      (i) => i.shiftId !== currentShift.id && i.carriedInto.includes(currentShift.id)
    );
    const own = db.inspections.filter((i) => i.shiftId === currentShift.id);
    // 交接时应带入：与本班有关且仍未闭环的异常
    const open = db.inspections
      .filter(
        (i) =>
          i.status !== "resolved" &&
          (i.shiftId === currentShift.id || i.carriedInto.includes(currentShift.id))
      )
      .sort((a, b) => a.createdAt - b.createdAt);
    return { carriedOver: carried, currentInspections: own, openCarried: open };
  }, [db, currentShift]);

  // ---- 提交：参数 / 异常的 upsert ----
  const submitParam = (entity: ParamReading, base: ParamReading | null) => {
    const op: PendingOp = { kind: "upsert", entityType: "param", data: entity, base, by: operator, at: nowTs() };
    enqueue(op);
    setEditingParam(null);
  };

  const submitInspection = (entity: Inspection, base: Inspection | null) => {
    const op: PendingOp = {
      kind: "upsert",
      entityType: "inspection",
      data: entity,
      base,
      by: operator,
      at: nowTs(),
    };
    enqueue(op);
    setEditingInsp(null);
  };

  // ---- 交接班：锁定旧班 + 开新班 + 带入未处理异常（单条原子操作） ----
  const confirmHandover = (input: {
    newShiftName: string;
    newOperator: string;
    handoverTo: string;
    summary: string;
  }) => {
    if (!currentShift || !activeShift || currentShift.id !== activeShift.id) return;
    const ts = nowTs();
    const oldShift: Shift = {
      ...currentShift,
      status: "locked",
      endedAt: ts,
      handoverTo: input.handoverTo,
      handoverSummary: input.summary,
      updateAt: ts,
      updateBy: operator,
    };
    const newShift: Shift = {
      id: uid("shift"),
      name: input.newShiftName,
      status: "active",
      operator: input.newOperator,
      startedAt: ts,
      endedAt: null,
      handoverTo: null,
      handoverSummary: "",
      createdAt: ts,
      createdBy: input.newOperator,
      updateAt: ts,
      updateBy: input.newOperator,
    };
    const op: PendingOp = {
      kind: "handover",
      oldShift,
      newShift,
      carryIds: openCarried.map((i) => i.id),
      base: {
        shifts: { [currentShift.id]: currentShift },
        inspections: Object.fromEntries(openCarried.map((i) => [i.id, i])),
      },
      by: operator,
      at: ts,
    };
    enqueue(op);
    setSelectedShiftId(newShift.id);
    setHandoverOpen(false);
  };

  // ---- 冲突人工确认 ----
  const resolveConflict = (conflict: FieldConflict, choice: "local" | "remote") => {
    const op: PendingOp = {
      kind: "resolve",
      conflictId: conflict.id,
      entityType: conflict.entityType,
      entityId: conflict.entityId,
      field: conflict.field,
      value: choice === "local" ? conflict.localValue : conflict.remoteValue,
      by: operator,
      at: nowTs(),
    };
    enqueue(op);
  };

  const isViewingActive = currentShift?.status === "active";

  return (
    <main className="app">
      <header className="topbar panel">
        <div className="topbar-title">
          <h1>船舶轮机值班记录</h1>
          <span>数据保存在本浏览器 · 多标签页可同时记录、自动合并</span>
        </div>
        <div className="topbar-operator">
          <label className="field compact">
            <span>当前操作者</span>
            <input
              className="control"
              value={operator}
              placeholder="输入姓名再记录"
              onChange={(e) => changeOperator(e.target.value)}
            />
          </label>
        </div>
      </header>

      {(storageError || draftCount > 0) && (
        <div className={`banner ${storageError ? "banner-error" : "banner-pending"}`}>
          <div>
            {storageError ? (
              <>
                <strong>存储失败：</strong>
                {storageError}
                {draftCount > 0 && (
                  <em>
                    （{draftCount} 条待提交草稿{draftSavedAt ? `，保存于 ${formatTime(draftSavedAt)}` : ""}
                    ，重新打开浏览器仍可继续）
                  </em>
                )}
              </>
            ) : (
              <>
                <strong>有待提交草稿：</strong>
                {draftCount} 条操作等待写入本地存储，将自动重试。
              </>
            )}
          </div>
          <button className="primary" onClick={retry}>
            立即重试
          </button>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}

      {db.conflicts.length > 0 && (
        <ConflictPanel db={db} operator={operator} onResolve={resolveConflict} />
      )}

      {currentShift && <Dashboard db={db} shift={currentShift} />}

      <section className="workspace">
        <aside className="panel">
          <div className="heading">
            <div>
              <p>值班班次</p>
              <h2>班次切换</h2>
            </div>
          </div>
          <div className="shift-list">
            {shiftsDesc.map((s) => {
              const openCount = db.inspections.filter(
                (i) =>
                  i.status !== "resolved" &&
                  (i.shiftId === s.id || i.carriedInto.includes(s.id))
              ).length;
              return (
                <button
                  key={s.id}
                  className={`shift-card ${currentShift?.id === s.id ? "selected" : ""}`}
                  onClick={() => setSelectedShiftId(s.id)}
                >
                  <div className="shift-card-main">
                    <strong>{s.name}</strong>
                    <small>
                      {s.operator} · {formatTs(s.startedAt)}
                    </small>
                  </div>
                  <span className="shift-card-side">
                    {s.status === "active" ? (
                      <Badge tone="teal">进行中</Badge>
                    ) : (
                      <Badge tone="neutral">已锁定</Badge>
                    )}
                    {openCount > 0 && <Badge tone="orange">异常 {openCount}</Badge>}
                  </span>
                </button>
              );
            })}
          </div>
          {activeShift && (
            <button
              className="primary handover-btn"
              disabled={!operator}
              title={operator ? "" : "请先填写当前操作者"}
              onClick={() => {
                setSelectedShiftId(activeShift.id);
                setHandoverOpen(true);
              }}
            >
              班次交接（锁定本班并带入未处理异常）
            </button>
          )}
          {!activeShift && (
            <p className="empty">当前没有进行中的班次，请开启新班次后继续记录。</p>
          )}
          <p className="hint shift-hint">
            交接后班次锁定只读；新班次自动带入仍未处理的异常巡检项。
          </p>
        </aside>

        <div className="workspace-main">
          {currentShift && !isViewingActive && (
            <section className="panel locked-notice">
              <h2>{currentShift.name}（已交接锁定）</h2>
              <p>
                值班员 {currentShift.operator}
                {currentShift.endedAt ? ` · ${formatTs(currentShift.endedAt)} 交接` : ""}
                {currentShift.handoverTo ? ` · 接班人 ${currentShift.handoverTo}` : ""}
              </p>
              {currentShift.handoverSummary && <p className="handover-summary">「{currentShift.handoverSummary}」</p>}
              <p className="muted">历史班次只读，可在下方时间线与设备历史中查看。</p>
            </section>
          )}

          {currentShift && isViewingActive && (
            <div className="form-grid">
              <ParamForm
                shift={currentShift}
                operator={operator}
                editing={editingParam}
                onSubmit={submitParam}
                onCancelEdit={() => setEditingParam(null)}
              />
              <InspectionForm
                shift={currentShift}
                operator={operator}
                editing={editingInsp}
                onSubmit={submitInspection}
                onCancelEdit={() => setEditingInsp(null)}
              />
            </div>
          )}

          {currentShift && (
            <Timeline
              db={db}
              shift={currentShift}
              carriedOver={carriedOver}
              items={currentInspections}
              onEdit={(item) => setEditingInsp(item)}
            />
          )}
        </div>
      </section>

      <HistoryPanel
        db={db}
        onEditParam={isViewingActive ? (p) => setEditingParam(p) : undefined}
      />

      {handoverOpen && activeShift && (
        <HandoverDialog
          shift={activeShift}
          operator={operator}
          carried={openCarried}
          onClose={() => setHandoverOpen(false)}
          onConfirm={confirmHandover}
        />
      )}
    </main>
  );
}

export default App;
