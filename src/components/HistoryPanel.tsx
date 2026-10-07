import { useMemo, useState } from "react";
import type { Database, ParamReading } from "../types";
import { EQUIPMENTS, formatTs, metricLabel, metricUnit } from "../lib/constants";
import { Badge, EmptyState } from "./ui";

export function HistoryPanel({
  db,
  onEditParam,
}: {
  db: Database;
  onEditParam?: (record: ParamReading) => void;
}) {
  const [shiftFilter, setShiftFilter] = useState<string>("all");
  const [equipmentFilter, setEquipmentFilter] = useState<string>("all");

  const shiftName = (id: string) => db.shifts.find((s) => s.id === id)?.name ?? "未知班次";

  const rows = useMemo(() => {
    return db.params
      .filter((p) => (shiftFilter === "all" ? true : p.shiftId === shiftFilter))
      .filter((p) => (equipmentFilter === "all" ? true : p.equipment === equipmentFilter))
      .sort((a, b) => b.recordedAt - a.recordedAt);
  }, [db, shiftFilter, equipmentFilter]);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>设备历史</p>
          <h2>参数读数历史</h2>
        </div>
        <Badge tone="neutral">{rows.length} 条</Badge>
      </div>

      <div className="filter-bar">
        <label className="inline-filter">
          <span>班次</span>
          <select
            className="control"
            value={shiftFilter}
            onChange={(e) => setShiftFilter(e.target.value)}
          >
            <option value="all">全部班次</option>
            {[...db.shifts].reverse().map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.status === "active" ? "（进行中）" : "（已交接）"}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-filter">
          <span>设备</span>
          <select
            className="control"
            value={equipmentFilter}
            onChange={(e) => setEquipmentFilter(e.target.value)}
          >
            <option value="all">全部设备</option>
            {EQUIPMENTS.map((eq) => (
              <option key={eq}>{eq}</option>
            ))}
          </select>
        </label>
      </div>

      {rows.length === 0 && <EmptyState text="该筛选条件下暂无历史读数。" />}

      <div className="history-table">
        {rows.map((p, index) => {
          const shift = db.shifts.find((s) => s.id === p.shiftId);
          const editable = Boolean(onEditParam && shift?.status === "active");
          return (
            <article key={p.id} className="history-row">
              <b>{String(index + 1).padStart(2, "0")}</b>
              <div>
                <h3>
                  {p.equipment} · {metricLabel(p.metricKey)}
                  <span className="reading-value">
                    {p.value}
                    {metricUnit(p.metricKey) ? ` ${metricUnit(p.metricKey)}` : ""}
                  </span>
                </h3>
                <p>
                  {shiftName(p.shiftId)} · {formatTs(p.recordedAt)} · {p.recordedBy}
                  {p.note ? ` · ${p.note}` : ""}
                </p>
              </div>
              {editable && (
                <button className="link-btn" onClick={() => onEditParam?.(p)}>
                  编辑
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
