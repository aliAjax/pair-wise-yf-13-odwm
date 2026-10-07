import type { Database, Inspection, Shift } from "../types";
import { formatTs, INSPECTION_STATUS_LABEL } from "../lib/constants";
import { Badge, EmptyState } from "./ui";

const STATUS_TONE = {
  open: "red",
  inprogress: "orange",
  resolved: "teal",
} as const;

interface TimelineProps {
  db: Database;
  shift: Shift;
  /** 上一班带入（当前班次开始时仍未处理、createdAt 更早）的异常 */
  carriedOver: Inspection[];
  /** 本班登记 + 直接带入本版的异常 */
  items: Inspection[];
  onEdit: (item: Inspection) => void;
}

export function Timeline({ db, shift, carriedOver, items, onEdit }: TimelineProps) {
  const shiftName = (id: string) => db.shifts.find((s) => s.id === id)?.name ?? "已删除班次";
  const all = [...carriedOver, ...items].sort((a, b) => b.updateAt - a.updateAt);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>异常记录时间线</p>
          <h2>
            {shift.name} · {shift.status === "active" ? "进行中" : "已锁定"}
          </h2>
        </div>
        <Badge tone="orange">未处理 {all.filter((i) => i.status !== "resolved").length}</Badge>
      </div>

      {all.length === 0 && <EmptyState text="本班暂无异常巡检项。" />}

      <div className="timeline">
        {all.map((item) => {
          const isCarried = carriedOver.some((c) => c.id === item.id);
          return (
            <article key={item.id} className="timeline-item">
              <div className="timeline-dot" data-status={item.status} />
              <div className="timeline-body">
                <div className="timeline-head">
                  <h3>
                    {item.equipment} · {item.title}
                  </h3>
                  <Badge tone={STATUS_TONE[item.status]}>
                    {INSPECTION_STATUS_LABEL[item.status]}
                  </Badge>
                </div>
                <p className="timeline-desc">{item.description || "（无描述）"}</p>
                {item.handling && (
                  <p className="timeline-handling">
                    <b>处置：</b>
                    {item.handling}
                    {item.handler && <span className="muted">（{item.handler}）</span>}
                  </p>
                )}
                <div className="timeline-foot">
                  <span className="muted">
                    登记于 {shiftName(item.shiftId)} · {formatTs(item.createdAt)} ·{" "}
                    {item.createdBy}
                  </span>
                  <span className="tag-row">
                    {isCarried && <Badge tone="blue">上一班带入</Badge>}
                    {item.carriedInto.length > 0 && (
                      <Badge tone="neutral">已带入 {item.carriedInto.length} 个后续班次</Badge>
                    )}
                    {item.status === "resolved" && (
                      <Badge tone="teal">{formatTs(item.resolvedAt)} 闭环</Badge>
                    )}
                  </span>
                  {shift.status === "active" && (
                    <button className="link-btn" onClick={() => onEdit(item)}>
                      {item.status === "resolved" ? "查看 / 重开" : "处置"}
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
