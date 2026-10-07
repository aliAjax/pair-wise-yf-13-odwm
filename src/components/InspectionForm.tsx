import { useEffect, useState } from "react";
import type { Inspection, InspectionStatus, Shift } from "../types";
import { EQUIPMENTS, INSPECTION_STATUS_LABEL } from "../lib/constants";
import { nowTs, uid } from "../lib/storage";
import { Field, Input, Select, Textarea } from "./ui";

interface InspectionFormProps {
  shift: Shift;
  operator: string;
  /** 处置 / 编辑时传入原异常项（基线），登记新异常为 null */
  editing: Inspection | null;
  onSubmit: (entity: Inspection, base: Inspection | null) => void;
  onCancelEdit: () => void;
}

const EMPTY = {
  equipment: EQUIPMENTS[0],
  title: "",
  description: "",
  status: "open" as InspectionStatus,
  handling: "",
  handler: "",
};

export function InspectionForm({
  shift,
  operator,
  editing,
  onSubmit,
  onCancelEdit,
}: InspectionFormProps) {
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (editing) {
      setForm({
        equipment: editing.equipment,
        title: editing.title,
        description: editing.description,
        status: editing.status,
        handling: editing.handling,
        handler: editing.handler,
      });
    } else {
      setForm(EMPTY);
    }
  }, [editing]);

  const submit = () => {
    if (!form.title.trim()) return;
    const ts = nowTs();
    if (editing) {
      const resolving = form.status === "resolved" && editing.status !== "resolved";
      const entity: Inspection = {
        ...editing,
        equipment: form.equipment,
        title: form.title.trim(),
        description: form.description.trim(),
        status: form.status,
        handling: form.handling.trim(),
        handler: form.handler.trim() || operator,
        resolvedAt: resolving ? ts : editing.resolvedAt,
        updateAt: ts,
        updateBy: operator,
      };
      onSubmit(entity, editing);
    } else {
      const entity: Inspection = {
        id: uid("insp"),
        shiftId: shift.id,
        carriedInto: [],
        equipment: form.equipment,
        title: form.title.trim(),
        description: form.description.trim(),
        status: form.status,
        handling: form.handling.trim(),
        handler: form.handler.trim() || (form.status === "open" ? "" : operator),
        resolvedAt: form.status === "resolved" ? ts : null,
        createdAt: ts,
        createdBy: operator,
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
          <p>异常巡检</p>
          <h2>{editing ? "异常处置 / 编辑" : "登记异常巡检项"}</h2>
        </div>
        {editing && (
          <button className="ghost" onClick={onCancelEdit}>
            取消
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
        <Field label="异常标题">
          <Input
            value={form.title}
            placeholder="如：冷却水温偏高"
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </Field>
        <Field label="异常描述">
          <Textarea
            rows={2}
            value={form.description}
            placeholder="现象、数值、发生时间"
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
        <Field label="处理状态">
          <Select
            value={form.status}
            onChange={(e) =>
              setForm({ ...form, status: e.target.value as InspectionStatus })
            }
          >
            {(Object.keys(INSPECTION_STATUS_LABEL) as InspectionStatus[]).map((s) => (
              <option key={s} value={s}>
                {INSPECTION_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="处置措施">
          <Textarea
            rows={2}
            value={form.handling}
            placeholder="采取的措施、复查结果"
            onChange={(e) => setForm({ ...form, handling: e.target.value })}
          />
        </Field>
        <Field label="处置人">
          <Input
            value={form.handler}
            placeholder={operator || "填写处置人"}
            onChange={(e) => setForm({ ...form, handler: e.target.value })}
          />
        </Field>
      </div>
      <div className="form-actions">
        <button className="primary" disabled={!form.title.trim()} onClick={submit}>
          {editing ? "提交处置" : "登记异常项"}
        </button>
      </div>
    </section>
  );
}
