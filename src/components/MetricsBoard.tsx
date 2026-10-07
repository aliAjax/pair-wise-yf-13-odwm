import { useStore } from "../lib/store";
import { METRICS, formatTime } from "../lib/helpers";
import type { Reading } from "../lib/types";

export default function MetricsBoard() {
  const { intended, activeShiftId } = useStore();

  const shiftReadings = intended.readings
    .filter((reading) => reading.shiftId === activeShiftId)
    .sort((a, b) => b.recordedAt - a.recordedAt);

  return (
    <section className="metrics">
      {METRICS.slice(0, 4).map((metric) => {
        const latest: Reading | undefined = shiftReadings.find((reading) => reading.metric === metric.name);
        return (
          <article key={metric.name}>
            <small>{metric.name}</small>
            {latest ? (
              <>
                <strong>
                  {latest.value}
                  <i>{latest.unit}</i>
                </strong>
                <span>
                  {formatTime(latest.recordedAt)} · {latest.updatedBy}
                </span>
              </>
            ) : (
              <strong className="empty-value">—</strong>
            )}
          </article>
        );
      })}
    </section>
  );
}
