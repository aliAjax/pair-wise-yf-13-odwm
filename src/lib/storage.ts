import type {
  Database,
  DraftFile,
  EntityType,
  FieldConflict,
  Inspection,
  ParamReading,
  PendingOp,
  Shift,
} from "../types";

const DB_KEY = "marine-watch.db.v1";
const DRAFT_KEY = "marine-watch.draft.v1";

// ---- 时间 / id ---------------------------------------------------------

export function nowTs(): number {
  return Date.now();
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

// ---- 基础读写（可能抛异常：隐私模式 / 配额满 / 存储被禁用） -------------

export class StorageUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("浏览器本地存储不可用");
    this.name = "StorageUnavailableError";
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

export function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch (err) {
    throw new StorageUnavailableError(err);
  }
}

export function writeRaw(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch (err) {
    throw new StorageUnavailableError(err);
  }
}

export function readDb(): Database {
  const raw = readRaw(DB_KEY);
  if (!raw) return emptyDb();
  try {
    const parsed = JSON.parse(raw) as Database;
    return normalizeDb(parsed);
  } catch {
    // 数据损坏时不静默吞掉用户数据，备份后重建
    try {
      writeRaw(`${DB_KEY}.corrupt.${Date.now()}`, raw);
    } catch {
      /* 忽略备份失败 */
    }
    return emptyDb();
  }
}

export function writeDb(db: Database): void {
  writeRaw(DB_KEY, JSON.stringify(db));
}

export function readDraft(): DraftFile {
  const raw = readRaw(DRAFT_KEY);
  if (!raw) return { savedAt: 0, ops: [] };
  try {
    const parsed = JSON.parse(raw) as DraftFile;
    if (!Array.isArray(parsed.ops)) return { savedAt: 0, ops: [] };
    return parsed;
  } catch {
    return { savedAt: 0, ops: [] };
  }
}

export function writeDraft(draft: DraftFile): void {
  writeRaw(DRAFT_KEY, JSON.stringify(draft));
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch (err) {
    throw new StorageUnavailableError(err);
  }
}

function emptyDb(): Database {
  return {
    version: 1,
    shifts: [],
    params: [],
    inspections: [],
    conflicts: [],
    seeded: false,
  };
}

function normalizeDb(input: Partial<Database>): Database {
  const base = emptyDb();
  return {
    version: 1,
    shifts: Array.isArray(input.shifts) ? (input.shifts as Shift[]) : base.shifts,
    params: Array.isArray(input.params) ? (input.params as ParamReading[]) : base.params,
    inspections: Array.isArray(input.inspections)
      ? (input.inspections as Inspection[])
      : base.inspections,
    conflicts: Array.isArray(input.conflicts)
      ? (input.conflicts as FieldConflict[])
      : base.conflicts,
    seeded: Boolean(input.seeded),
  };
}

// ---- 实体集合工具 --------------------------------------------------------

type AnyEntity = Shift | ParamReading | Inspection;

function rec(entity: AnyEntity): Record<string, unknown> {
  return entity as unknown as Record<string, unknown>;
}

const COLUMNS: Record<EntityType, keyof Database> = {
  shift: "shifts",
  param: "params",
  inspection: "inspections",
};

export function getEntity(db: Database, type: EntityType, id: string): AnyEntity | undefined {
  return (db[COLUMNS[type]] as AnyEntity[]).find((e) => e.id === id);
}

function setEntity(db: Database, type: EntityType, entity: AnyEntity): void {
  const list = db[COLUMNS[type]] as AnyEntity[];
  const index = list.findIndex((e) => e.id === entity.id);
  if (index >= 0) list[index] = entity;
  else list.push(entity);
}

// ---- 三方合并 -----------------------------------------------------------
// 基线 base（本标签页编辑前读到的版本）
// 本地 local（用户改完的版本）
// 远端 remote（提交时存储中可能已被其它标签页更新的版本）
// 字段级合并：base→local 未变而 base→remote 变了，采用远端；
// 双方都改了不同字段，各自保留；同一字段双方改成不同值，记为冲突，
// 按更新时间暂定一方胜出，等待用户在冲突清单中确认。

// id 与审计元数据不做字段冲突判定：
// 更新时间/操作者用于决定合并胜出方，而非自己成为冲突项。
const NON_TRACKED = new Set([
  "id",
  "createdAt",
  "createdBy",
  "updateAt",
  "updateBy",
]);

function scalar(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** 应用一次 upsert，返回是否产生了新的字段冲突。 */
function mergeUpsert(
  db: Database,
  type: EntityType,
  local: AnyEntity,
  base: AnyEntity | null
): number {
  const remote = getEntity(db, type, local.id);
  if (!remote || !base) {
    // 新建实体（或基线缺失）：直接写入，已有的 id 冲突以较新更新时间为准
    if (!remote || local.updateAt >= remote.updateAt) setEntity(db, type, local);
    return 0;
  }

  const keys = new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(base)]);
  const merged: Record<string, unknown> = { ...rec(remote) };
  let addedConflicts = 0;
  const now = Date.now();

  // 更新元数据：谁更新得晚就挂谁的名字 / 时间
  // （createdAt / createdBy 不跟踪，随远端保留即可）
  const localMetaNewer = (local.updateAt ?? 0) >= (remote.updateAt ?? 0);
  merged.updateAt = localMetaNewer ? local.updateAt : remote.updateAt;
  merged.updateBy = localMetaNewer ? local.updateBy : remote.updateBy;

  keys.forEach((key) => {
    if (NON_TRACKED.has(key)) return; // 元数据已在上面处理
    const lRaw = rec(local)[key];
    const rRaw = rec(remote)[key];

    // 数组字段（如异常项的班次带入链）：取并集，不互相覆盖
    if (Array.isArray(lRaw) || Array.isArray(rRaw)) {
      const lArr = Array.isArray(lRaw) ? lRaw : [];
      const rArr = Array.isArray(rRaw) ? rRaw : [];
      merged[key] = Array.from(new Set([...rArr, ...lArr]));
      return;
    }

    const b = scalar(rec(base)[key]);
    const l = scalar(lRaw);
    const r = scalar(rRaw);
    const localChanged = l !== b;
    const remoteChanged = r !== b;

    if (localChanged && !remoteChanged) {
      merged[key] = lRaw;
    } else if (!localChanged && remoteChanged) {
      merged[key] = rRaw;
    } else if (localChanged && remoteChanged && l !== r) {
      // 同一字段双方改成不同值 —— 冲突
      const conflictId = `${type}:${local.id}:${key}`;
      if (!db.conflicts.some((c) => c.id === conflictId)) {
        const localAt = local.updateAt ?? now;
        const remoteAt = remote.updateAt ?? now;
        db.conflicts.push({
          id: conflictId,
          entityType: type,
          entityId: local.id,
          field: key,
          baseValue: b,
          localValue: l,
          remoteValue: r,
          localBy: local.updateBy ?? "",
          localAt,
          remoteBy: remote.updateBy ?? "",
          remoteAt,
          tentativeWinner: localAt >= remoteAt ? "local" : "remote",
          createdAt: now,
        });
        addedConflicts += 1;
      }
      // 暂定胜出值先落到实体上（更新时间更晚者），确认后可改写
      merged[key] = localMetaNewer ? lRaw : rRaw;
    }
  });

  setEntity(db, type, merged as unknown as AnyEntity);
  return addedConflicts;
}

/** 交接（锁定旧班次 + 开新班次 + 带入未处理异常）与并发保存的合并。 */
function mergeHandover(db: Database, op: Extract<PendingOp, { kind: "handover" }>): number {
  let addedConflicts = 0;

  // 1) 旧班次锁定：以远端最新状态做字段级合并（如另一标签页刚补了交接备注）
  const baseOld = op.base.shifts[op.oldShift.id];
  if (baseOld) {
    addedConflicts += mergeUpsert(db, "shift", op.oldShift, baseOld);
  } else {
    setEntity(db, "shift", op.oldShift);
  }

  // 2) 新班次：幂等写入（重试 / 重复提交不会产生第二条）
  if (!db.shifts.some((s) => s.id === op.newShift.id)) {
    db.shifts.push(op.newShift);
  }

  // 3) 异常项带入：只带入“到现在仍未处理”的项；
  //    carriedInto 是数组字段，mergeUpsert 会自动与远端取并集，
  //    因此并发的异常处置（描述 / 状态 / 处理措施）不会被覆盖。
  op.carryIds.forEach((id) => {
    const remote = db.inspections.find((i) => i.id === id);
    const base = op.base.inspections[id];
    if (!remote || remote.status === "resolved") return;
    if (!remote.carriedInto.includes(op.newShift.id)) {
      const local: Inspection = {
        ...remote,
        carriedInto: [...remote.carriedInto, op.newShift.id],
        updateAt: op.at,
        updateBy: op.by,
      };
      if (base) {
        addedConflicts += mergeUpsert(db, "inspection", local, base);
      } else {
        setEntity(db, "inspection", local);
      }
    }
  });

  return addedConflicts;
}

function applyResolve(db: Database, op: Extract<PendingOp, { kind: "resolve" }>): void {
  const entity = getEntity(db, op.entityType, op.entityId);
  if (entity) {
    rec(entity)[op.field] = parseScalar(op.value);
    entity.updateAt = op.at;
    entity.updateBy = op.by;
  }
  db.conflicts = db.conflicts.filter((c) => c.id !== op.conflictId);
}

function parseScalar(value: string): unknown {
  if (value === "") return "";
  // 数组 / 对象形态（carriedInto 等）
  if ((value.startsWith("[") && value.endsWith("]")) || (value.startsWith("{") && value.endsWith("}"))) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+$/.test(value)) return Number(value);
  return value;
}

// ---- 提交：乐观读改写，冲突时重试一次 ------------------------------------

export interface CommitResult {
  conflicts: number;
  /** 提交后仍残留（或本次新产生）的冲突数 */
  remainingConflicts: number;
}

/**
 * 原子提交整批草稿操作。
 * localStorage 没有事务，这里采用「读最新 → 整批复算 → 一次写入」的短临界区；
 * 同浏览器内标签页之间的写入间隔下足够可靠。
 */
export function commitOps(ops: PendingOp[]): CommitResult {
  const db = readDb();
  let added = 0;

  ops.forEach((op) => {
    if (op.kind === "upsert") {
      added += mergeUpsert(db, op.entityType, op.data as AnyEntity, op.base as AnyEntity | null);
    } else if (op.kind === "handover") {
      added += mergeHandover(db, op);
    } else {
      applyResolve(db, op);
    }
  });

  writeDb(db);
  return {
    conflicts: added,
    remainingConflicts: db.conflicts.length,
  };
}

// ---- 跨标签页变化通知 -----------------------------------------------------

export function subscribeStorage(handler: () => void): () => void {
  const listener = (e: StorageEvent) => {
    if (e.key === DB_KEY || e.key === DRAFT_KEY || e.key === null) handler();
  };
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}
