import type { Database, Inspection, MetricMeta, ParamReading, Shift } from "../types";

export const METRICS: MetricMeta[] = [
  { key: "rpm", label: "主机转速", unit: "rpm" },
  { key: "lubeOilPressure", label: "滑油压力", unit: "MPa" },
  { key: "coolingTemp", label: "冷却水温", unit: "℃" },
  { key: "fuelConsumption", label: "燃油消耗", unit: "L/h" },
  { key: "bilgeStatus", label: "舱底水状态", unit: "", options: ["正常", "偏高", "接近警戒线"] },
];

export const EQUIPMENTS = ["主机", "发电机#1", "发电机#2", "泵组", "舱底水"];

export const INSPECTION_STATUS_LABEL = {
  open: "未处理",
  inprogress: "处置中",
  resolved: "已处理",
} as const;

export function metricLabel(key: string): string {
  return METRICS.find((m) => m.key === key)?.label ?? key;
}

export function metricUnit(key: string): string {
  return METRICS.find((m) => m.key === key)?.unit ?? "";
}

export function formatTs(ts: number | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

export function formatTime(ts: number | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ---- 首次使用的种子数据：三个班次，异常项跨班带入，便于直接体验 ----------

export function seedDatabase(): Database {
  const today = new Date();
  const at = (h: number, m = 0) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m).getTime();

  const s1: Shift = {
    id: "shift-seed-1",
    name: "00-04班",
    status: "locked",
    operator: "张轮机",
    startedAt: at(0),
    endedAt: at(4),
    handoverTo: "李轮机",
    handoverSummary: "舱底水液位偏高，已通知接班复查。",
    createdAt: at(0),
    createdBy: "张轮机",
    updateAt: at(4),
    updateBy: "张轮机",
  };
  const s2: Shift = {
    id: "shift-seed-2",
    name: "04-08班",
    status: "locked",
    operator: "李轮机",
    startedAt: at(4),
    endedAt: at(8),
    handoverTo: "王轮机",
    handoverSummary: "发电机#2冷却水温偏高，待观察。",
    createdAt: at(4),
    createdBy: "李轮机",
    updateAt: at(8),
    updateBy: "李轮机",
  };
  const s3: Shift = {
    id: "shift-seed-3",
    name: "08-12班",
    status: "active",
    operator: "王轮机",
    startedAt: at(8),
    endedAt: null,
    handoverTo: null,
    handoverSummary: "",
    createdAt: at(8),
    createdBy: "王轮机",
    updateAt: at(8),
    updateBy: "王轮机",
  };

  const params: ParamReading[] = [
    {
      id: "param-seed-1",
      shiftId: s1.id,
      equipment: "主机",
      metricKey: "rpm",
      value: "82",
      note: "定速航行",
      recordedAt: at(0, 30),
      recordedBy: "张轮机",
      updateAt: at(0, 30),
      updateBy: "张轮机",
    },
    {
      id: "param-seed-2",
      shiftId: s1.id,
      equipment: "主机",
      metricKey: "lubeOilPressure",
      value: "0.42",
      note: "正常范围",
      recordedAt: at(0, 30),
      recordedBy: "张轮机",
      updateAt: at(0, 30),
      updateBy: "张轮机",
    },
    {
      id: "param-seed-3",
      shiftId: s2.id,
      equipment: "舱底水",
      metricKey: "bilgeStatus",
      value: "接近警戒线",
      note: "液位接近警戒线，已记录交班",
      recordedAt: at(5, 10),
      recordedBy: "李轮机",
      updateAt: at(5, 10),
      updateBy: "李轮机",
    },
    {
      id: "param-seed-4",
      shiftId: s3.id,
      equipment: "发电机#2",
      metricKey: "coolingTemp",
      value: "86",
      note: "温度偏高，已安排复查",
      recordedAt: at(8, 20),
      recordedBy: "王轮机",
      updateAt: at(8, 20),
      updateBy: "王轮机",
    },
    {
      id: "param-seed-5",
      shiftId: s3.id,
      equipment: "主机",
      metricKey: "fuelConsumption",
      value: "78",
      note: "正常巡检",
      recordedAt: at(9, 0),
      recordedBy: "王轮机",
      updateAt: at(9, 0),
      updateBy: "王轮机",
    },
  ];

  const inspections: Inspection[] = [
    {
      id: "insp-seed-1",
      shiftId: s1.id,
      carriedInto: [s2.id, s3.id],
      equipment: "舱底水",
      title: "舱底水液位偏高",
      description: "污水井液位持续上升，接近报警线",
      status: "inprogress",
      handling: "已开启舱底水泵抽水，流量待观察",
      handler: "李轮机",
      resolvedAt: null,
      createdAt: at(2, 40),
      createdBy: "张轮机",
      updateAt: at(5, 20),
      updateBy: "李轮机",
    },
    {
      id: "insp-seed-2",
      shiftId: s2.id,
      carriedInto: [s3.id],
      equipment: "发电机#2",
      title: "冷却水温偏高",
      description: "出口冷却水温 86℃，高于正常值",
      status: "open",
      handling: "",
      handler: "",
      resolvedAt: null,
      createdAt: at(6, 15),
      createdBy: "李轮机",
      updateAt: at(6, 15),
      updateBy: "李轮机",
    },
  ];

  return {
    version: 1,
    shifts: [s1, s2, s3],
    params,
    inspections,
    conflicts: [],
    seeded: true,
  };
}
