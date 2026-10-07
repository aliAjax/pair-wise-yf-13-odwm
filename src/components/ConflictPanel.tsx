import type { Database, EntityType, FieldConflict } from "../types";
import { formatTs } from "../lib/constants";
import { Badge, EmptyState } from "./ui";

export const FIELD_LABELS: Record<EntityType, Record<string, string>> = {
  shift: {
    name: "班次名称",
    operator: "值班轮机员",
    status: "班次状态",
    handoverTo: "接班人",
    handoverSummary: "交接备注",
    startedAt: "开始时间",
    endedAt: "结束时间",
  },
  param: {
    equipment: "设备名称",
    metricKey: "参数项",
    value: "参数读数",
    note: "备注",
    recordedAt: "记录时间",
    recordedBy: "记录人",
  },
  inspection: {
    equipment: "设备名称",
    title: "异常标题",
    description: "异常描述",
    status: "处理状态",
    handling: "处置措施",
    handler: "处置人",
    resolvedAt: "闭环时间",
  },
};

function entityTitle(db: Database, type: EntityType, id: string): string {
  if (type === "shift") {
    const s = db.shifts.find((x) => x.id === id);
    return s ? `班次 ${s.name}` : `班次 ${id}`;
  }
  if (type === "param") {
    const p = db.params.find((x) => x.id === id);
    return p ? `参数读数 ${p.equipment}` : `参数读数 ${id}`;
  }
  const i = db.inspections.find((x) => x.id === id);
  return i ? `异常项 ${i.equipment} · ${i.title}` : `异常项 ${id}`;
}

interface ConflictPanelProps {
  db: Database;
  operator: string;
  onResolve: (
    conflict: FieldConflict,
    choice: "local" | "remote",
    operator: string
  ) => void;
}

export function ConflictPanel({ db, operator, onResolve }: ConflictPanelProps) {
  const conflicts = [...db.conflicts].sort((a, b) => b.createdAt - a.createdAt);
  if (conflicts.length === 0) return null;

  return (
    <section className="panel conflict-panel">
      <div className="heading">
        <div>
          <p className="conflict-title">合并冲突待确认</p>
          <h2>{conflicts.length} 个字段在多个标签页被同时修改</h2>
        </div>
        <Badge tone="red">需人工确认</Badge>
      </div>
      <p className="muted conflict-hint">
        系统已按更新时间暂取较晚一方的值，但「参数读数」「异常处置」等字段不会静默覆盖，请逐项确认。
      </p>

      <div className="conflict-list">
        {conflicts.map((c) => {
          const fieldName = FIELD_LABELS[c.entityType][c.field] ?? c.field;
          return (
            <article key={c.id} className="conflict-card">
              <div className="conflict-meta">
                <h3>{entityTitle(db, c.entityType, c.entityId)}</h3>
                <Badge tone="orange">字段：{fieldName}</Badge>
              </div>
              <div className="conflict-values">
                <div className={c.tentativeWinner === "local" ? "version picked" : "version"}>
                  <small>
                    本标签页 · {c.localBy || "未署名"} · {formatTs(c.localAt)}
                  </small>
                  <p>{c.localValue || "（空）"}</p>
                  <button
                    className={c.tentativeWinner === "local" ? "primary" : ""}
                    onClick={() => onResolve(c, "local", operator)}
                  >
                    采用此值
                  </button>
                </div>
                <div className="conflict-arrow">⇄</div>
                <div className={c.tentativeWinner === "remote" ? "version picked" : "version"}>
                  <small>
                    另一标签页 · {c.remoteBy || "未署名"} · {formatTs(c.remoteAt)}
                  </small>
                  <p>{c.remoteValue || "（空）"}</p>
                  <button
                    className={c.tentativeWinner === "remote" ? "primary" : ""}
                    onClick={() => onResolve(c, "remote", operator)}
                  >
                    采用此值
                  </button>
                </div>
              </div>
              <p className="muted conflict-base">原值（基线）：{c.baseValue || "（空）"}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
