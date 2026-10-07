import type { Conflict, ConflictKind, Handling, Inspection, StoredData } from "./types";

interface Versioned {
  id: string;
  updatedAt: number;
}

function mergeLists<T extends Versioned>(
  local: T[],
  remote: T[],
  kind: ConflictKind,
  mergeSame?: (local: T, remote: T) => { value: T; conflict: boolean },
): { merged: T[]; conflicts: Conflict<T>[] } {
  const remoteMap = new Map<string, T>();
  for (const item of remote) remoteMap.set(item.id, item);

  const merged: T[] = [];
  const conflicts: Conflict<T>[] = [];
  const seen = new Set<string>();

  for (const item of local) {
    seen.add(item.id);
    const counterpart = remoteMap.get(item.id);
    if (!counterpart) {
      merged.push(item);
      continue;
    }
    if (mergeSame) {
      const { value, conflict } = mergeSame(item, counterpart);
      merged.push(value);
      if (conflict) {
        conflicts.push({
          id: `${kind}:${item.id}:${Math.max(item.updatedAt, counterpart.updatedAt)}`,
          kind,
          recordId: item.id,
          local: item,
          remote: counterpart,
        });
      }
    } else if (item.updatedAt === counterpart.updatedAt) {
      if (JSON.stringify(item) === JSON.stringify(counterpart)) {
        merged.push(item);
      } else {
        // 同 ID 同更新时间但内容不一致：更新时间无法判定先后，交操作者确认
        merged.push(item);
        conflicts.push({
          id: `${kind}:${item.id}:${item.updatedAt}`,
          kind,
          recordId: item.id,
          local: item,
          remote: counterpart,
        });
      }
    } else {
      // 按更新时间合并：新者胜
      merged.push(item.updatedAt > counterpart.updatedAt ? item : counterpart);
    }
  }

  // 对方新增的记录（其他标签页追加的读数、异常项等）直接并入，互不覆盖
  for (const item of remote) {
    if (!seen.has(item.id)) merged.push(item);
  }

  return { merged, conflicts };
}

// 异常巡检项：处置记录取并集并按时间排序，互不覆盖
function mergeInspectionSame(local: Inspection, remote: Inspection): { value: Inspection; conflict: boolean } {
  const handlingMap = new Map<string, Handling>();
  for (const handling of local.handlings) handlingMap.set(handling.id, handling);

  let conflict = false;
  for (const handling of remote.handlings) {
    const existing = handlingMap.get(handling.id);
    if (!existing) {
      handlingMap.set(handling.id, handling);
    } else if (JSON.stringify(existing) !== JSON.stringify(handling)) {
      conflict = true;
    }
  }

  const handlings = [...handlingMap.values()].sort((a, b) => a.at - b.at);
  const latest = handlings[handlings.length - 1];

  if (
    local.description !== remote.description ||
    local.device !== remote.device ||
    local.shiftId !== remote.shiftId
  ) {
    conflict = true;
  }

  return {
    value: {
      ...local,
      handlings,
      carriedFrom: local.carriedFrom ?? remote.carriedFrom,
      updatedAt: Math.max(local.updatedAt, remote.updatedAt, latest?.at ?? 0),
      updatedBy: latest?.by ?? local.updatedBy,
    },
    conflict,
  };
}

export interface MergeResult extends StoredData {
  conflicts: Conflict[];
}

export function mergeState(local: StoredData, remote: StoredData): MergeResult {
  const shifts = mergeLists(local.shifts, remote.shifts, "shift");
  const readings = mergeLists(local.readings, remote.readings, "reading");
  const inspections = mergeLists(local.inspections, remote.inspections, "inspection", mergeInspectionSame);

  return {
    shifts: shifts.merged,
    readings: readings.merged,
    inspections: inspections.merged,
    conflicts: [...shifts.conflicts, ...readings.conflicts, ...inspections.conflicts],
  };
}

// 草稿依次合并进当前数据；草稿记录时间更新，正常胜出，冲突项仍单列
export function applyDrafts(base: StoredData, drafts: { shifts: ShiftLike[]; readings: ReadingLike[]; inspections: InspectionLike[] }[]): MergeResult {
  let current: StoredData = base;
  const conflicts: Conflict[] = [];
  for (const draft of drafts) {
    const result = mergeState(current, {
      shifts: draft.shifts as StoredData["shifts"],
      readings: draft.readings as StoredData["readings"],
      inspections: draft.inspections as StoredData["inspections"],
    });
    current = { shifts: result.shifts, readings: result.readings, inspections: result.inspections };
    conflicts.push(...result.conflicts);
  }
  return { ...current, conflicts };
}

type ShiftLike = StoredData["shifts"][number];
type ReadingLike = StoredData["readings"][number];
type InspectionLike = StoredData["inspections"][number];

export function replaceRecord(data: StoredData, kind: Conflict["kind"], record: unknown): StoredData {
  if (kind === "shift") {
    const next = record as StoredData["shifts"][number];
    return { ...data, shifts: data.shifts.map((item) => (item.id === next.id ? next : item)) };
  }
  if (kind === "reading") {
    const next = record as StoredData["readings"][number];
    return { ...data, readings: data.readings.map((item) => (item.id === next.id ? next : item)) };
  }
  const next = record as StoredData["inspections"][number];
  return { ...data, inspections: data.inspections.map((item) => (item.id === next.id ? next : item)) };
}
