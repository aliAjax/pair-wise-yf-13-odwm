// 值班班次
export type ShiftStatus = "active" | "handed";

export interface Shift {
  id: string;
  name: string; // 如 "08-12班"
  startAt: number;
  endAt: number | null; // 交接时间，交接后锁定
  status: ShiftStatus;
  handoverNote: string;
  createdAt: number;
  updatedAt: number;
  updatedBy: string;
}

// 机舱参数读数：每次读数独立成条，多标签页各自追加、互不覆盖
export interface Reading {
  id: string;
  shiftId: string;
  device: string; // 主机 / 发电机 / 泵组 / 舱底水
  metric: string; // 主机转速 / 滑油压力 / 冷却水温 / 燃油消耗 / 舱底水液位
  value: number;
  unit: string;
  recordedAt: number;
  createdAt: number;
  updatedAt: number;
  updatedBy: string;
}

// 异常处置动作：open 未处理 / handling 处理中 / resolved 已处理 / carry 从上一班次带入
export type HandlingAction = "open" | "handling" | "resolved" | "carry";

export interface Handling {
  id: string;
  at: number;
  by: string;
  action: HandlingAction;
  note: string;
}

// 异常巡检项：处置记录按时间追加，合并时取并集，不能相互覆盖
export interface Inspection {
  id: string;
  shiftId: string;
  device: string;
  description: string;
  handlings: Handling[];
  carriedFrom?: string; // 由哪个班次带入
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  updatedBy: string;
}

export type ConflictKind = "shift" | "reading" | "inspection";

export interface Conflict<T = unknown> {
  id: string;
  kind: ConflictKind;
  recordId: string;
  local: T;
  remote: T;
}

// 待提交草稿：主存储写入失败时保留，重试合并后再落库
export interface Draft {
  id: string;
  createdAt: number;
  description: string;
  shifts: Shift[];
  readings: Reading[];
  inspections: Inspection[];
}

export interface StoredData {
  shifts: Shift[];
  readings: Reading[];
  inspections: Inspection[];
}

export type Resolution = "local" | "remote";
