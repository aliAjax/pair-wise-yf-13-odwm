import { useEffect, useState } from "react";
import { useStore } from "../lib/store";
import { formatFullTime } from "../lib/helpers";
import type { Conflict, Resolution } from "../lib/types";

interface ConflictVersion {
  title: string;
  detail: string;
  updatedAt: number;
  updatedBy: string;
}

function describe(conflict: Conflict, side: "local" | "remote"): ConflictVersion {
  const record = side === "local" ? conflict.local : conflict.remote;
  if (conflict.kind === "shift") {
    const shift = record as import("../lib/types").Shift;
    return {
      title: `班次 ${shift.name}`,
      detail: `${shift.status === "active" ? "在岗" : "已锁定"}${shift.handoverNote ? ` · 交接备注：${shift.handoverNote}` : ""}`,
      updatedAt: shift.updatedAt,
      updatedBy: shift.updatedBy,
    };
  }
  if (conflict.kind === "reading") {
    const reading = record as import("../lib/types").Reading;
    return {
      title: `${reading.device} · ${reading.metric}`,
      detail: `读数 ${reading.value}${reading.unit}`,
      updatedAt: reading.updatedAt,
      updatedBy: reading.updatedBy,
    };
  }
  const inspection = record as import("../lib/types").Inspection;
  return {
    title: `${inspection.device} · 异常巡检`,
    detail: inspection.description,
    updatedAt: inspection.updatedAt,
    updatedBy: inspection.updatedBy,
  };
}

const KIND_LABELS: Record<Conflict["kind"], string> = {
  shift: "班次",
  reading: "参数读数",
  inspection: "异常巡检项",
};

export default function ConflictPanel() {
  const { conflicts, resolveConflicts } = useStore();
  const [choices, setChoices] = useState<Record<string, Resolution>>({});

  useEffect(() => {
    setChoices({});
  }, [conflicts]);

  if (conflicts.length === 0) return null;

  const allDecided = conflicts.every((conflict) => choices[conflict.id]);

  const chooseAll = (resolution: Resolution) => {
    const next: Record<string, Resolution> = {};
    for (const conflict of conflicts) next[conflict.id] = resolution;
    setChoices(next);
  };

  return (
    <section className="panel conflict-panel">
      <div className="heading">
        <div>
          <p>多标签页合并</p>
          <h2>{conflicts.length} 项冲突需确认</h2>
        </div>
        <div className="btn-row">
          <button onClick={() => chooseAll("local")}>全部采用本机</button>
          <button onClick={() => chooseAll("remote")}>全部采用对方</button>
        </div>
      </div>
      <p className="conflict-tip">
        以下记录在多个标签页被同时修改，更新时间无法判定先后。参数读数与异常处置已各自保留，仅对同一条记录的不同版本请操作者确认。
      </p>
      <ul className="conflict-list">
        {conflicts.map((conflict) => {
          const local = describe(conflict, "local");
          const remote = describe(conflict, "remote");
          const choice = choices[conflict.id];
          return (
            <li key={conflict.id} className="conflict-item">
              <div className="conflict-kind">{KIND_LABELS[conflict.kind]}</div>
              <div className={`conflict-version ${choice === "local" ? "picked" : ""}`}>
                <strong>本机版本</strong>
                <b>{local.title}</b>
                <span>{local.detail}</span>
                <em>
                  {local.updatedBy} · {formatFullTime(local.updatedAt)}
                </em>
                <button
                  className={choice === "local" ? "primary" : ""}
                  onClick={() => setChoices((prev) => ({ ...prev, [conflict.id]: "local" }))}
                >
                  采用本机
                </button>
              </div>
              <div className={`conflict-version ${choice === "remote" ? "picked" : ""}`}>
                <strong>对方版本</strong>
                <b>{remote.title}</b>
                <span>{remote.detail}</span>
                <em>
                  {remote.updatedBy} · {formatFullTime(remote.updatedAt)}
                </em>
                <button
                  className={choice === "remote" ? "primary" : ""}
                  onClick={() => setChoices((prev) => ({ ...prev, [conflict.id]: "remote" }))}
                >
                  采用对方
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="conflict-footer">
        <button className="primary" disabled={!allDecided} onClick={() => resolveConflicts(choices)}>
          确认合并并保存
        </button>
      </div>
    </section>
  );
}
