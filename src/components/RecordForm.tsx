import { useState } from "react";
import type { FormEvent } from "react";
import { useStore } from "../lib/store";
import { DEVICES, METRICS, unitOf } from "../lib/helpers";
import type { HandlingAction } from "../lib/types";

const STATUS_OPTIONS: { value: HandlingAction; label: string }[] = [
  { value: "open", label: "未处理" },
  { value: "handling", label: "处理中" },
  { value: "resolved", label: "已处理" },
];

export default function RecordForm() {
  const { addRecord, activeShift, operator } = useStore();
  const [device, setDevice] = useState<string>(DEVICES[0]);
  const [metric, setMetric] = useState<string>(METRICS[0].name);
  const [value, setValue] = useState<string>("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<HandlingAction>("open");

  const hasShift = activeShift?.status === "active";

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    addRecord({
      device,
      metric,
      value: numeric,
      description,
      status: description.trim() ? status : "open",
    });
    setValue("");
    setDescription("");
    setStatus("open");
  };

  return (
    <form className="panel form-panel" onSubmit={handleSubmit}>
      <div className="heading">
        <div>
          <p>机舱参数 / 异常巡检</p>
          <h2>新增记录</h2>
        </div>
        <button className="primary" type="submit" disabled={!hasShift}>
          保存记录
        </button>
      </div>

      {!hasShift && (
        <p className="form-tip">当前班次已交接锁定，新增记录请先交接班进入新班次。</p>
      )}

      <div className="field-grid">
        <label>
          <span>值班班次</span>
          <input value={activeShift ? `${activeShift.name}（${activeShift.status === "active" ? "在岗" : "已锁定"}）` : "暂无班次"} readOnly />
        </label>
        <label>
          <span>操作者</span>
          <input value={operator} readOnly />
        </label>
        <label>
          <span>设备名称</span>
          <select value={device} onChange={(event) => setDevice(event.target.value)}>
            {DEVICES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>参数项</span>
          <select value={metric} onChange={(event) => setMetric(event.target.value)}>
            {METRICS.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}（{item.unit}）
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>参数读数</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            placeholder={`填写读数，单位 ${unitOf(metric)}`}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            required
          />
        </label>
        <label>
          <span>处理状态</span>
          <select
            value={status}
            disabled={!description.trim()}
            onChange={(event) => setStatus(event.target.value as HandlingAction)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field-wide">
          <span>异常描述（填写后生成异常巡检项）</span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="如：冷却水温偏高，已安排复查"
          />
        </label>
      </div>
    </form>
  );
}
