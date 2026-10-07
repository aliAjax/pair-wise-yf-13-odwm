import type { HandlingAction, Inspection, Shift } from "./types";

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function latestAction(inspection: Inspection): HandlingAction {
  return inspection.handlings[inspection.handlings.length - 1]?.action ?? "open";
}

export const ACTION_LABELS: Record<HandlingAction, string> = {
  open: "未处理",
  handling: "处理中",
  resolved: "已处理",
  carry: "带入",
};

export const DEVICES = ["主机", "发电机", "泵组", "舱底水"] as const;

export const METRICS: { name: string; unit: string }[] = [
  { name: "主机转速", unit: "rpm" },
  { name: "滑油压力", unit: "MPa" },
  { name: "冷却水温", unit: "℃" },
  { name: "燃油消耗", unit: "L/h" },
  { name: "舱底水液位", unit: "%" },
];

export function unitOf(metric: string): string {
  return METRICS.find((item) => item.name === metric)?.unit ?? "";
}

// 由上一班次名称推算下一班次，如 08-12班 → 12-16班；20-24班 → 00-04班
export function nextShiftName(name: string): string {
  const match = name.match(/^(\d{1,2})-(\d{1,2})/);
  if (!match) {
    const now = new Date();
    const start = now.getHours();
    return `${pad(start)}-${pad((start + 4) % 24)}班`;
  }
  const end = parseInt(match[2], 10);
  if (end >= 24) return "00-04班";
  return `${pad(end)}-${pad(end + 4)}班`;
}

export function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatFullTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function pickActiveShift(shifts: Shift[]): Shift | null {
  const active = shifts
    .filter((shift) => shift.status === "active")
    .sort((a, b) => b.startAt - a.startAt)[0];
  if (active) return active;
  return [...shifts].sort((a, b) => b.startAt - a.startAt)[0] ?? null;
}
