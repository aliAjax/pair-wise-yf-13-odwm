import { useStore } from "../lib/store";
import { formatTime } from "../lib/helpers";

export default function HistoryList({ deviceFilter }: { deviceFilter: string | null }) {
  const { intended, activeShiftId, activeShift, pendingIds } = useStore();

  const readings = intended.readings
    .filter((reading) => reading.shiftId === activeShiftId)
    .filter((reading) => (deviceFilter ? reading.device === deviceFilter : true))
    .sort((a, b) => b.recordedAt - a.recordedAt);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>设备历史</p>
          <h2>按班次筛选 · 参数读数记录</h2>
        </div>
        <span className="record-count">
          {activeShift?.name ?? ""} · {readings.length} 条
        </span>
      </div>

      {readings.length === 0 ? (
        <p className="empty-tip">当前筛选条件下暂无读数记录。切换班次或设备筛选查看历史。</p>
      ) : (
        <div className="records">
          {readings.map((reading, index) => (
            <article key={reading.id}>
              <b>{String(readings.length - index).padStart(2, "0")}</b>
              <div>
                <h3>
                  {reading.device} · {reading.metric}
                  {pendingIds.has(reading.id) && <span className="pending-tag">待提交</span>}
                </h3>
                <p>
                  读数 <strong>{reading.value}{reading.unit}</strong> · {formatTime(reading.recordedAt)} · {reading.updatedBy}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
