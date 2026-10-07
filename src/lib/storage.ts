import type { Draft, Inspection, Reading, Shift, StoredData } from "./types";

const KEYS = {
  shifts: "ew.shifts.v1",
  readings: "ew.readings.v1",
  inspections: "ew.inspections.v1",
  drafts: "ew.drafts.v1",
  operator: "ew.operator.v1",
  settings: "ew.settings.v1",
} as const;

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown, simulateFailure: boolean): void {
  if (simulateFailure) {
    throw new Error("模拟存储写入失败");
  }
  localStorage.setItem(key, JSON.stringify(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function validateShifts(value: unknown): Shift[] {
  return asArray<unknown>(value).filter(
    (item): item is Shift => isRecord(item) && typeof item.id === "string" && typeof item.name === "string",
  );
}

function validateReadings(value: unknown): Reading[] {
  return asArray<unknown>(value).filter(
    (item): item is Reading =>
      isRecord(item) && typeof item.id === "string" && typeof item.shiftId === "string" && typeof item.metric === "string",
  );
}

function validateInspections(value: unknown): Inspection[] {
  return asArray<unknown>(value).filter(
    (item): item is Inspection =>
      isRecord(item) && typeof item.id === "string" && Array.isArray((item as Inspection).handlings),
  );
}

export function loadAll(): StoredData {
  return {
    shifts: validateShifts(readJSON<unknown>(KEYS.shifts, [])),
    readings: validateReadings(readJSON<unknown>(KEYS.readings, [])),
    inspections: validateInspections(readJSON<unknown>(KEYS.inspections, [])),
  };
}

export function saveAll(data: StoredData, simulateFailure: boolean): void {
  writeJSON(KEYS.shifts, data.shifts, simulateFailure);
  writeJSON(KEYS.readings, data.readings, simulateFailure);
  writeJSON(KEYS.inspections, data.inspections, simulateFailure);
}

export function loadDrafts(): Draft[] {
  return asArray<Draft>(readJSON<unknown>(KEYS.drafts, [])).filter(
    (d): d is Draft => isRecord(d) && typeof d.id === "string" && Array.isArray((d as Draft).shifts),
  );
}

// 草稿本身也写失败时，由调用方保留在内存中，本次会话内仍然可重试
export function saveDrafts(drafts: Draft[], simulateFailure: boolean): void {
  writeJSON(KEYS.drafts, drafts, simulateFailure);
}

export function loadOperator(): string {
  const value = readJSON<unknown>(KEYS.operator, "");
  return typeof value === "string" ? value : "";
}

export function saveOperator(name: string): void {
  localStorage.setItem(KEYS.operator, JSON.stringify(name));
}

export function loadSimulateFailure(): boolean {
  return readJSON<boolean>(KEYS.settings, false) === true;
}

export function saveSimulateFailure(value: boolean): void {
  localStorage.setItem(KEYS.settings, JSON.stringify(value));
}

export { KEYS as STORAGE_KEYS };
