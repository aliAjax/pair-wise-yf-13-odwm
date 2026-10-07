import { useEffect, useState } from "react";
import type { ParamReading, Shift } from "../types";
import { EQUIPMENTS, METRICS } from "../lib/constants";
import { nowTs, uid } from "../lib/storage";
import { Field, Input, Select, Textarea } from "./ui";

interface ParamFormProps {
  shift: Shift;
  operator: string;
  /** 编辑时传入原记录（同时作为三方合并的基线），新增为 null */
  editing: ParamReading | null;
  onSubmit: (entity: ParamReading, base: ParamReading | null) => void;
  onCancelEdit: () => void;
}

const EMPTY = {
  equipment: EQUIPMENTS[0],
  metricKey: METRICS[0].key,
  value: "",
  note: "",
};

export function ParamForm({ shift, operator, editing, onSubmit, onCancelEdit }: ParamFormProps) {
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (editing) {
      setForm({
        equipment: editing.equipment,
        metricKey: editing.metricKey,
        value: editing.value,
        note: editing.note,
      });
    } else {
      setForm(EMPTY);
    }
  }, [editing]);

  const meta = METRICS.find((m) => m.key === form.metricKey)!;

  const submit = () => {
    if (!form.value.trim()) return;
    const ts = nowTs();
    if (editing) {
      const entity: ParamReading = {
        ...editing,
        equipment: form.equipment,
        metricKey: form.metricKey,
        value: form.value.trim(),
        note: form.note.trim(),
        updateAt: ts,
        updateBy: operator,
      };
      onSubmit(entity, editing);
    } else {
      const entity: ParamReading = {
        id: uid("param"),
        shiftId: shift.id,
        equipment: form.equipment,
        metricKey: form.metricKey,
        value: form.value.trim(),
        note: form.note.trim(),
        recordedAt: ts,
        recordedBy: operator,
        updateAt: ts,
        updateBy: operator,
      };
      onSubmit(entity, null);
    }
    setForm(EMPTY);
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>机舱参数</p>
          <h2>{editing ? "编辑参数读数" : "录入参数读数"}</h2>
        </div>
        {editing && (
          <button className="ghost" onClick={onCancelEdit}>
            取消编辑
          </button>
        )}
      </div>
      <div className="field-grid">
        <Field label="设备名称">
          <Select
            value={form.equipment}
            onChange={(e) => setForm({ ...form, equipment: e.target.value })}
          >
            {EQUIPMENTS.map((eq) => (
              <option key={eq}>{eq}</option>
            ))}
          </Select>
        </Field>
        <Field label="参数项">
          <Select
            value={form.metricKey}
            onChange={(e) =>
              setForm({ ...form, metricKey: e.target.value as (typeof METRICS)[number]["key"] })
            }
          >
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={meta.unit ? `读数（${meta.unit}）` : "状态"}>
          {meta.options ? (
            <Select
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
            >
              <option value="">请选择</option>
              {meta.options.map((opt) => (
                <option key={opt}>{opt}</option>
              ))}
            </Select>
          ) : (
            <Input
              value={form.value}
              placeholder={`填写${meta.label}`}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          )}
        </Field>
        <Field label="备注">
          <Input
            value={form.note}
            placeholder="正常巡检 / 偏高已复查 …"
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </Field>
      </div>
      <div className="form-actions">
        <button className="primary" disabled={!form.value.trim()} onClick={submit}>
          {editing ? "保存修改" : "保存读数"}
        </button>
        <span className="hint">
          记录归属班次：{shift.name}
          {shift.status === "locked" ? "（该班次已锁定，只能查看）" : ""}
        </span>
      </div>
    </section>
  );
}
