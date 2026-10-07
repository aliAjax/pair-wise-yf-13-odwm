import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  loadAll,
  loadDrafts,
  loadOperator,
  loadSimulateFailure,
  saveAll,
  saveDrafts,
  saveOperator,
  saveSimulateFailure,
  STORAGE_KEYS,
} from "./storage";
import { applyDrafts, mergeState, replaceRecord } from "./merge";
import type { Conflict, Draft, HandlingAction, Inspection, Reading, Resolution, Shift, StoredData } from "./types";
import { latestAction, nextShiftName, pad, pickActiveShift, uid } from "./helpers";

interface StoreState {
  committed: StoredData; // 最近一次成功写入 localStorage 的数据
  drafts: Draft[]; // 写入失败后保留的待提交草稿
  conflicts: Conflict[]; // 多标签页合并时的冲突项
  operator: string;
  simulateFailure: boolean;
  activeShiftId: string | null;
  notice: string | null;
}

interface RecordInput {
  device: string;
  metric: string;
  value: number;
  description: string;
  status: HandlingAction;
}

interface StoreValue extends StoreState {
  intended: StoredData; //  committed + 草稿（界面展示的就是它）
  pendingIds: Set<string>; // 仅存在于草稿、尚未落库的记录 id
  activeShift: Shift | null;
  setOperator: (name: string) => void;
  setSimulateFailure: (value: boolean) => void;
  setActiveShift: (id: string) => void;
  startFirstShift: () => void;
  discardAllDrafts: () => void;
  addRecord: (input: RecordInput) => void;
  addHandling: (inspectionId: string, action: HandlingAction, note: string) => void;
  handover: (shiftId: string, note: string) => void;
  resolveConflicts: (choices: Record<string, Resolution>) => void;
  retryDraft: (draftId: string) => void;
  retryAllDrafts: () => void;
  discardDraft: (draftId: string) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreState>(() => {
    const committed = loadAll();
    const drafts = loadDrafts();
    return {
      committed,
      drafts,
      conflicts: [],
      operator: loadOperator() || "轮机员",
      simulateFailure: loadSimulateFailure(),
      activeShiftId: pickActiveShift(committed.shifts)?.id ?? null,
      notice: null,
    };
  });

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const noticeTimer = useRef<number | null>(null);
  const notify = useCallback((message: string) => {
    setState((prev) => ({ ...prev, notice: message }));
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => {
      setState((prev) => ({ ...prev, notice: null }));
    }, 3600);
  }, []);

  // 尝试写入主数据；草稿列表一并落库。任一失败即返回 false，由调用方保留草稿
  const trySave = useCallback((data: StoredData, drafts: Draft[], simulateFailure: boolean): boolean => {
    try {
      saveAll(data, simulateFailure);
      try {
        saveDrafts(drafts, simulateFailure);
      } catch {
        // 草稿本身也写失败时，仅保留在内存中
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  // 变更主流程：先尝试落库，失败则把目标状态存为草稿，重试成功后再合并
  const persistOrDraft = useCallback(
    (data: StoredData, description: string) => {
      const current = stateRef.current;
      if (trySave(data, current.drafts, current.simulateFailure)) {
        setState((prev) => ({ ...prev, committed: data, drafts: [], conflicts: [] }));
      } else {
        const draft: Draft = {
          id: uid(),
          createdAt: Date.now(),
          description,
          shifts: data.shifts,
          readings: data.readings,
          inspections: data.inspections,
        };
        const nextDrafts = [...current.drafts, draft];
        try {
          saveDrafts(nextDrafts, current.simulateFailure);
        } catch {
          // 草稿落库也失败：只在内存保留，本次会话仍可重试
        }
        setState((prev) => ({ ...prev, drafts: nextDrafts }));
        notify("存储失败：已保留待提交草稿，可稍后重试");
      }
    },
    [notify, trySave],
  );

  // 其他标签页写入后触发：合并对方更新，冲突项单列，参数读数/异常处置互不覆盖
  const syncFromRemote = useCallback(() => {
    const current = stateRef.current;
    const remote = loadAll();
    const intended = applyDrafts(current.committed, current.drafts).data;
    const result = mergeState(intended, remote);

    if (result.conflicts.length === 0) {
      if (trySave(result, current.drafts, current.simulateFailure)) {
        setState((prev) => ({ ...prev, committed: result, drafts: [], conflicts: [] }));
      } else {
        const draft: Draft = {
          id: uid(),
          createdAt: Date.now(),
          description: "同步其他标签页更新（落库失败，待重试）",
          shifts: result.shifts,
          readings: result.readings,
          inspections: result.inspections,
        };
        const nextDrafts = [...current.drafts, draft];
        try {
          saveDrafts(nextDrafts, current.simulateFailure);
        } catch {
          // 仅内存保留
        }
        setState((prev) => ({ ...prev, drafts: nextDrafts }));
      }
    } else {
      setState((prev) => ({ ...prev, conflicts: result.conflicts }));
    }
  }, [trySave]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (!event.key) return;
      const watched: string[] = [STORAGE_KEYS.shifts, STORAGE_KEYS.readings, STORAGE_KEYS.inspections];
      if (watched.includes(event.key)) {
        syncFromRemote();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [syncFromRemote]);

  const intended = useMemo(
    () => applyDrafts(state.committed, state.drafts).data,
    [state.committed, state.drafts],
  );

  const pendingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const draft of state.drafts) {
      for (const shift of draft.shifts) ids.add(shift.id);
      for (const reading of draft.readings) ids.add(reading.id);
      for (const inspection of draft.inspections) ids.add(inspection.id);
    }
    for (const shift of state.committed.shifts) ids.delete(shift.id);
    for (const reading of state.committed.readings) ids.delete(reading.id);
    for (const inspection of state.committed.inspections) ids.delete(inspection.id);
    return ids;
  }, [state.committed, state.drafts]);

  const activeShift = useMemo(
    () => intended.shifts.find((shift) => shift.id === state.activeShiftId) ?? pickActiveShift(intended.shifts),
    [intended.shifts, state.activeShiftId],
  );

  const setOperator = useCallback((name: string) => {
    setState((prev) => ({ ...prev, operator: name }));
    saveOperator(name);
  }, []);

  const setSimulateFailure = useCallback((value: boolean) => {
    setState((prev) => ({ ...prev, simulateFailure: value }));
    saveSimulateFailure(value);
  }, []);

  const setActiveShift = useCallback((id: string) => {
    setState((prev) => ({ ...prev, activeShiftId: id }));
  }, []);

  // 还没有任何班次时，按当前时间窗创建首个在岗班次
  const startFirstShift = useCallback(() => {
    const current = stateRef.current;
    const base = applyDrafts(current.committed, current.drafts).data;
    if (base.shifts.some((shift) => shift.status === "active")) return;
    const now = Date.now();
    const d = new Date(now);
    const start = Math.floor(d.getHours() / 4) * 4;
    const name = `${pad(start)}-${pad(start + 4)}班`;
    const shift: Shift = {
      id: uid(),
      name,
      startAt: now,
      endAt: null,
      status: "active",
      handoverNote: "",
      createdAt: now,
      updatedAt: now,
      updatedBy: current.operator,
    };
    persistOrDraft({ ...base, shifts: [...base.shifts, shift] }, `新建班次：${name}`);
    setState((prev) => ({ ...prev, activeShiftId: shift.id }));
  }, [persistOrDraft]);

  const discardAllDrafts = useCallback(() => {
    const current = stateRef.current;
    try {
      saveDrafts([], current.simulateFailure);
    } catch {
      // 仅内存保留
    }
    setState((prev) => ({ ...prev, drafts: [] }));
  }, []);

  const addRecord = useCallback(
    (input: RecordInput) => {
      const current = stateRef.current;
      const base = applyDrafts(current.committed, current.drafts).data;
      const shift = base.shifts.find((item) => item.id === current.activeShiftId) ?? pickActiveShift(base.shifts);
      if (!shift || shift.status !== "active") {
        notify("当前没有可记录的班次，请先交接班或新建班次");
        return;
      }

      const now = Date.now();
      const reading: Reading = {
        id: uid(),
        shiftId: shift.id,
        device: input.device,
        metric: input.metric,
        value: input.value,
        unit: input.metric === "主机转速" ? "rpm" : input.metric === "滑油压力" ? "MPa" : input.metric === "冷却水温" ? "℃" : input.metric === "燃油消耗" ? "L/h" : "%",
        recordedAt: now,
        createdAt: now,
        updatedAt: now,
        updatedBy: current.operator,
      };

      let inspections = base.inspections;
      if (input.description.trim()) {
        const action: HandlingAction = input.status;
        const inspection: Inspection = {
          id: uid(),
          shiftId: shift.id,
          device: input.device,
          description: input.description.trim(),
          handlings: [
            {
              id: uid(),
              at: now,
              by: current.operator,
              action,
              note: action === "open" ? "巡检发现异常" : `新增记录并标记为${action === "handling" ? "处理中" : "已处理"}`,
            },
          ],
          createdAt: now,
          createdBy: current.operator,
          updatedAt: now,
          updatedBy: current.operator,
        };
        inspections = [...base.inspections, inspection];
      }

      persistOrDraft(
        { shifts: base.shifts, readings: [...base.readings, reading], inspections },
        `新增${input.device}读数：${input.metric}`,
      );
    },
    [notify, persistOrDraft],
  );

  const addHandling = useCallback(
    (inspectionId: string, action: HandlingAction, note: string) => {
      const current = stateRef.current;
      const base = applyDrafts(current.committed, current.drafts).data;
      const target = base.inspections.find((item) => item.id === inspectionId);
      if (!target) return;
      const shift = base.shifts.find((item) => item.id === target.shiftId);
      if (!shift || shift.status !== "active") {
        notify("班次已交接锁定，不能继续处置");
        return;
      }
      const now = Date.now();
      const updated: Inspection = {
        ...target,
        handlings: [
          ...target.handlings,
          { id: uid(), at: now, by: current.operator, action, note: note.trim() || (action === "resolved" ? "异常已消除" : "已安排复查处理") },
        ],
        updatedAt: now,
        updatedBy: current.operator,
      };
      persistOrDraft(
        {
          shifts: base.shifts,
          readings: base.readings,
          inspections: base.inspections.map((item) => (item.id === inspectionId ? updated : item)),
        },
        `处置异常巡检项：${target.description.slice(0, 12)}`,
      );
    },
    [notify, persistOrDraft],
  );

  const handover = useCallback(
    (shiftId: string, note: string) => {
      const current = stateRef.current;
      const base = applyDrafts(current.committed, current.drafts).data;
      const oldShift = base.shifts.find((item) => item.id === shiftId);
      if (!oldShift || oldShift.status !== "active") return;

      const now = Date.now();
      const handedShift: Shift = {
        ...oldShift,
        status: "handed",
        endAt: now,
        handoverNote: note.trim(),
        updatedAt: now,
        updatedBy: current.operator,
      };
      const newShift: Shift = {
        id: uid(),
        name: nextShiftName(oldShift.name),
        startAt: now,
        endAt: null,
        status: "active",
        handoverNote: "",
        createdAt: now,
        updatedAt: now,
        updatedBy: current.operator,
      };

      // 新班次带入仍未处理（未处理/处理中）的异常巡检项，处置记录完整保留
      const carried: Inspection[] = base.inspections
        .filter((item) => item.shiftId === shiftId && latestAction(item) !== "resolved")
        .map((item) => ({
          ...item,
          id: uid(),
          shiftId: newShift.id,
          carriedFrom: shiftId,
          handlings: [
            ...item.handlings,
            { id: uid(), at: now, by: current.operator, action: "carry" as const, note: `由 ${oldShift.name} 交接带入` },
          ],
          createdAt: now,
          updatedAt: now,
          updatedBy: current.operator,
        }));

      const data: StoredData = {
        shifts: [...base.shifts.map((item) => (item.id === shiftId ? handedShift : item)), newShift],
        readings: base.readings,
        inspections: [...base.inspections, ...carried],
      };
      persistOrDraft(data, `交接班：${oldShift.name} → ${newShift.name}`);
      setState((prev) => ({ ...prev, activeShiftId: newShift.id }));
      notify(`交接班完成：${oldShift.name} 已锁定，未处理异常已带入 ${newShift.name}`);
    },
    [notify, persistOrDraft],
  );

  // 冲突项逐项确认后合并落库；未全部确认时不落库，避免覆盖任何一方
  const resolveConflicts = useCallback(
    (choices: Record<string, Resolution>) => {
      const current = stateRef.current;
      const base = applyDrafts(current.committed, current.drafts).data;
      let next = base;
      for (const conflict of current.conflicts) {
        const choice = choices[conflict.id];
        if (!choice) continue;
        const version = choice === "local" ? conflict.local : conflict.remote;
        next = replaceRecord(next, conflict.kind, version);
      }
      if (trySave(next, current.drafts, current.simulateFailure)) {
        setState((prev) => ({ ...prev, committed: next, drafts: [], conflicts: [] }));
        notify("冲突已合并保存");
      } else {
        const draft: Draft = {
          id: uid(),
          createdAt: Date.now(),
          description: "冲突合并结果（落库失败，待重试）",
          shifts: next.shifts,
          readings: next.readings,
          inspections: next.inspections,
        };
        const nextDrafts = [...current.drafts, draft];
        try {
          saveDrafts(nextDrafts, current.simulateFailure);
        } catch {
          // 仅内存保留
        }
        setState((prev) => ({ ...prev, drafts: nextDrafts, conflicts: [] }));
      }
    },
    [notify, trySave],
  );

  const retryDraft = useCallback(
    (draftId: string) => {
      const current = stateRef.current;
      const draft = current.drafts.find((item) => item.id === draftId);
      if (!draft) return;
      const remote = loadAll();
      const without = current.drafts.filter((item) => item.id !== draftId);
      const base = applyDrafts(current.committed, without).data;
      const result = mergeState(base, { shifts: draft.shifts, readings: draft.readings, inspections: draft.inspections });

      if (result.conflicts.length > 0) {
        setState((prev) => ({ ...prev, conflicts: result.conflicts }));
        return;
      }
      if (trySave(result, without, current.simulateFailure)) {
        setState((prev) => ({ ...prev, committed: result, drafts: without }));
        notify("草稿已提交并合并完成");
      } else {
        notify("存储仍然失败，草稿继续保留");
      }
    },
    [notify, trySave],
  );

  const retryAllDrafts = useCallback(() => {
    const current = stateRef.current;
    if (current.drafts.length === 0) return;
    const remote = loadAll();
    const base = applyDrafts(current.committed, []).data;
    const mergedDrafts = applyDrafts(base, current.drafts).data;
    const result = mergeState(mergedDrafts, remote);

    if (result.conflicts.length > 0) {
      setState((prev) => ({ ...prev, conflicts: result.conflicts }));
      return;
    }
    if (trySave(result, [], current.simulateFailure)) {
      setState((prev) => ({ ...prev, committed: result, drafts: [] }));
      notify("全部草稿已提交并合并完成");
    } else {
      notify("存储仍然失败，草稿继续保留");
    }
  }, [notify, trySave]);

  const discardDraft = useCallback(
    (draftId: string) => {
      const current = stateRef.current;
      const nextDrafts = current.drafts.filter((item) => item.id !== draftId);
      try {
        saveDrafts(nextDrafts, current.simulateFailure);
      } catch {
        // 仅内存保留
      }
      setState((prev) => ({ ...prev, drafts: nextDrafts }));
    },
    [current.simulateFailure],
  );

  const value: StoreValue = {
    ...state,
    intended,
    pendingIds,
    activeShift,
    setOperator,
    setSimulateFailure,
    setActiveShift,
    startFirstShift,
    discardAllDrafts,
    addRecord,
    addHandling,
    handover,
    resolveConflicts,
    retryDraft,
    retryAllDrafts,
    discardDraft,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore 必须在 StoreProvider 内使用");
  return context;
}
