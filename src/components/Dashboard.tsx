import type { Database, Shift } from "../types";
import { METRICS, metricUnit } from "../lib/constants";

export function Dashboard({ db, shift }: { db: Database; shift: Shift }) {
  return (
    <section className="metrics">
      {METRICS.map((m) => {
        const readings = db.params
          .filter((p) => p.shiftId === shift.id && p.metricKey === m.key)
          .sort((a, b) => b.recordedAt - a.recordedAt);
        const latest = readings[0];
        return (
          <article key={m.key}>
            <small>
              {m.label}
              {readings.length > 0 && <em className="metric-count">本班 {readings.length} 条</em>}
            </small>
            <strong>
              {latest ? latest.value : "—"}
              {latest && m.unit ? <i className="unit">{m.unit}</i> : null}
            </strong>
            <p className="metric-meta">
              {latest ? `${latest.equipment} · ${latest.note || "无备注"}` : "本班尚未录入"}
            </p>
          </article>
        );
      })}
    </section>
  );
}
