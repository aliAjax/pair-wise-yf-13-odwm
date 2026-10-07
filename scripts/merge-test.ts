// 并发合并逻辑测试（Node 下模拟两个标签页）
// 通过 esbuild 打包后直接运行，不依赖 vitest。
import assert from "node:assert";
import type { Inspection, ParamReading, Shift } from "../src/types";
import {
  commitOps,
  readDb,
  writeDb,
  writeDraft,
  readDraft,
} from "../src/lib/storage";

// ---- 极简 localStorage 内存实现，可模拟写入失败 ----
class MemStorage {
  map = new Map<string, string>();
  fail = false;
  /** 仅对指定 key 写入失败（模拟草稿可写、数据库提交失败） */
  failKeys = new Set<string>();
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    if (this.fail || this.failKeys.has(key)) {
      throw new Error("QuotaExceededError: simulated");
    }
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
    this.failKeys.clear();
  }
}

const mem = new MemStorage();
(globalThis as { window: unknown }).window = {
  localStorage: mem,
  addEventListener: () => {},
  removeEventListener: () => {},
};

let passed = 0;
function test(name: string, fn: () => void) {
  mem.clear();
  mem.fail = false;
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function makeShift(id: string, name: string, operator: string, ts: number): Shift {
  return {
    id,
    name,
    status: "active",
    operator,
    startedAt: ts,
    endedAt: null,
    handoverTo: null,
    handoverSummary: "",
    createdAt: ts,
    createdBy: operator,
    updateAt: ts,
    updateBy: operator,
  };
}

function makeParam(
  id: string,
  shiftId: string,
  value: string,
  note: string,
  by: string,
  at: number
): ParamReading {
  return {
    id,
    shiftId,
    equipment: "主机",
    metricKey: "rpm",
    value,
    note,
    recordedAt: at,
    recordedBy: by,
    updateAt: at,
    updateBy: by,
  };
}

// ---------- 测试 1：两个标签页改同一参数的不同字段，互不覆盖 ----------
test("参数：不同字段并发修改各自保留", () => {
  const base = makeParam("p1", "s1", "82", "初始", "甲", 1000);
  writeDb({
    version: 1,
    shifts: [],
    params: [base],
    inspections: [],
    conflicts: [],
    seeded: true,
  });

  // 标签页 A 改读数；标签页 B 改备注 —— 提交顺序任意
  const a: ParamReading = { ...base, value: "86", updateAt: 2000, updateBy: "甲" };
  const b: ParamReading = { ...base, note: "已复查", updateAt: 3000, updateBy: "乙" };

  // A 先基于 1000 时的快照提交
  commitOps([{ kind: "upsert", entityType: "param", data: a, base, by: "甲", at: 2000 }]);
  // B 仍拿着旧基线 base 提交
  const res = commitOps([
    { kind: "upsert", entityType: "param", data: b, base, by: "乙", at: 3000 },
  ]);

  const db = readDb();
  const merged = db.params[0];
  assert.equal(merged.value, "86", "A 的读数保留");
  assert.equal(merged.note, "已复查", "B 的备注保留（不被旧快照覆盖）");
  assert.equal(merged.updateBy, "乙", "更新时间更晚者署名");
  assert.equal(res.conflicts, 0, "不应产生冲突");
});

// ---------- 测试 2：同一字段双方改成不同值 → 冲突，按更新时间暂定 ----------
test("参数：同字段不同值产生冲突并暂定较晚一方", () => {
  const base = makeParam("p1", "s1", "82", "", "甲", 1000);
  writeDb({
    version: 1,
    shifts: [],
    params: [base],
    inspections: [],
    conflicts: [],
    seeded: true,
  });
  const a = { ...base, value: "86", updateAt: 2000, updateBy: "甲" };
  commitOps([{ kind: "upsert", entityType: "param", data: a, base, by: "甲", at: 2000 }]);
  const b = { ...base, value: "90", updateAt: 3000, updateBy: "乙" };
  const res = commitOps([
    { kind: "upsert", entityType: "param", data: b, base, by: "乙", at: 3000 },
  ]);

  const db = readDb();
  assert.equal(res.conflicts, 1, "应产生 1 个冲突");
  assert.equal(db.conflicts.length, 1);
  assert.equal(db.conflicts[0].field, "value");
  assert.equal(db.conflicts[0].localValue, "90");
  assert.equal(db.conflicts[0].remoteValue, "86");
  assert.equal(db.conflicts[0].tentativeWinner, "local", "较晚提交者暂定胜出");
  assert.equal(db.params[0].value, "90", "暂定取较晚者值");

  // 人工确认采用较早一方（A 的 86）
  commitOps([
    {
      kind: "resolve",
      conflictId: db.conflicts[0].id,
      entityType: "param",
      entityId: "p1",
      field: "value",
      value: "86",
      by: "值班长",
      at: 4000,
    },
  ]);
  const after = readDb();
  assert.equal(after.params[0].value, "86", "确认后改写为选定值");
  assert.equal(after.conflicts.length, 0, "冲突清除");
});

// ---------- 测试 3：异常处置不能覆盖，双方改不同字段保留 ----------
test("异常：处置措施与状态并发修改各自保留", () => {
  const base: Inspection = {
    id: "i1",
    shiftId: "s1",
    carriedInto: [],
    equipment: "舱底水",
    title: "液位高",
    description: "接近警戒",
    status: "open",
    handling: "",
    handler: "",
    resolvedAt: null,
    createdAt: 1000,
    createdBy: "甲",
    updateAt: 1000,
    updateBy: "甲",
  };
  writeDb({
    version: 1,
    shifts: [],
    params: [],
    inspections: [base],
    conflicts: [],
    seeded: true,
  });
  const a: Inspection = { ...base, handling: "开泵抽水", updateAt: 2000, updateBy: "甲" };
  commitOps([
    { kind: "upsert", entityType: "inspection", data: a, base, by: "甲", at: 2000 },
  ]);
  const b: Inspection = {
    ...base,
    status: "inprogress",
    handler: "乙",
    updateAt: 3000,
    updateBy: "乙",
  };
  const res = commitOps([
    { kind: "upsert", entityType: "inspection", data: b, base, by: "乙", at: 3000 },
  ]);

  const merged = readDb().inspections[0];
  assert.equal(merged.handling, "开泵抽水");
  assert.equal(merged.status, "inprogress");
  assert.equal(merged.handler, "乙");
  assert.equal(res.conflicts, 0);
});

// ---------- 测试 4：交接锁定 + 带入未处理异常；已处理的不带入 ----------
test("交接：锁定旧班、开新班、只带入未处理异常", () => {
  const s1 = makeShift("s1", "08-12班", "甲", 1000);
  const open: Inspection = {
    id: "i-open",
    shiftId: "s1",
    carriedInto: [],
    equipment: "发电机#2",
    title: "水温高",
    description: "",
    status: "open",
    handling: "",
    handler: "",
    resolvedAt: null,
    createdAt: 1500,
    createdBy: "甲",
    updateAt: 1500,
    updateBy: "甲",
  };
  const resolving: Inspection = {
    id: "i-done",
    shiftId: "s1",
    carriedInto: [],
    equipment: "泵组",
    title: "微渗漏",
    description: "",
    status: "resolved",
    handling: "紧固",
    handler: "甲",
    resolvedAt: 1600,
    createdAt: 1400,
    createdBy: "甲",
    updateAt: 1600,
    updateBy: "甲",
  };
  writeDb({
    version: 1,
    shifts: [s1],
    params: [],
    inspections: [open, resolving],
    conflicts: [],
    seeded: true,
  });

  const ts = 4000;
  const oldLocked: Shift = {
    ...s1,
    status: "locked",
    endedAt: ts,
    handoverTo: "乙",
    handoverSummary: "发电机水温待观察",
    updateAt: ts,
    updateBy: "甲",
  };
  const s2 = makeShift("s2", "12-16班", "乙", ts);

  commitOps([
    {
      kind: "handover",
      oldShift: oldLocked,
      newShift: s2,
      carryIds: ["i-open", "i-done"],
      base: { shifts: { s1 }, inspections: { "i-open": open, "i-done": resolving } },
      by: "甲",
      at: ts,
    },
  ]);

  const db = readDb();
  assert.equal(db.shifts.length, 2);
  assert.equal(db.shifts.find((x) => x.id === "s1")!.status, "locked");
  assert.equal(db.shifts.find((x) => x.id === "s2")!.status, "active");
  const carried = db.inspections.find((i) => i.id === "i-open")!;
  assert.deepEqual(carried.carriedInto, ["s2"], "未处理项带入新班");
  assert.equal(carried.status, "open");
  const done = db.inspections.find((i) => i.id === "i-done")!;
  assert.deepEqual(done.carriedInto, [], "已处理项不带入");
});

// ---------- 测试 5：交接与另一标签页的处置并发：处置不丢，带入链取并集 ----------
test("交接与并发处置合并：处置保留且带入链正确", () => {
  const s1 = makeShift("s1", "08-12班", "甲", 1000);
  const base: Inspection = {
    id: "i1",
    shiftId: "s1",
    carriedInto: [],
    equipment: "舱底水",
    title: "液位高",
    description: "",
    status: "open",
    handling: "",
    handler: "",
    resolvedAt: null,
    createdAt: 1500,
    createdBy: "甲",
    updateAt: 1500,
    updateBy: "甲",
  };
  writeDb({
    version: 1,
    shifts: [s1],
    params: [],
    inspections: [base],
    conflicts: [],
    seeded: true,
  });

  // 标签页 A：在旧班做处置（改 handling）
  const handled: Inspection = {
    ...base,
    handling: "开泵抽水",
    updateAt: 2000,
    updateBy: "丙",
  };
  commitOps([
    { kind: "upsert", entityType: "inspection", data: handled, base, by: "丙", at: 2000 },
  ]);

  // 标签页 B：同时执行交接（基线还是处置前）
  const ts = 3000;
  const oldLocked: Shift = { ...s1, status: "locked", endedAt: ts, handoverTo: "乙", handoverSummary: "", updateAt: ts, updateBy: "甲" };
  const s2 = makeShift("s2", "12-16班", "乙", ts);
  const res = commitOps([
    {
      kind: "handover",
      oldShift: oldLocked,
      newShift: s2,
      carryIds: ["i1"],
      base: { shifts: { s1 }, inspections: { i1: base } },
      by: "甲",
      at: ts,
    },
  ]);

  const db = readDb();
  const after = db.inspections.find((i) => i.id === "i1")!;
  assert.equal(after.handling, "开泵抽水", "并发处置没有被交接覆盖");
  assert.deepEqual(after.carriedInto, ["s2"], "带入链包含新班");
  assert.equal(after.status, "open");
  assert.equal(res.conflicts, 0, "不同字段不产生冲突");
});

// ---------- 测试 6：交接重放幂等（失败重试不会开两个新班） ----------
test("交接操作重试幂等", () => {
  const s1 = makeShift("s1", "08-12班", "甲", 1000);
  writeDb({
    version: 1,
    shifts: [s1],
    params: [],
    inspections: [],
    conflicts: [],
    seeded: true,
  });
  const ts = 3000;
  const oldLocked: Shift = { ...s1, status: "locked", endedAt: ts, handoverTo: "乙", handoverSummary: "", updateAt: ts, updateBy: "甲" };
  const s2 = makeShift("s2", "12-16班", "乙", ts);
  const op = {
    kind: "handover" as const,
    oldShift: oldLocked,
    newShift: s2,
    carryIds: [] as string[],
    base: { shifts: { s1 }, inspections: {} },
    by: "甲",
    at: ts,
  };
  commitOps([op]);
  commitOps([op]); // 模拟重试
  const db = readDb();
  assert.equal(db.shifts.length, 2, "重放不产生重复班次");
});

// ---------- 测试 7：存储失败 → 草稿持久化 → 恢复后重放合并 ----------
test("存储失败保留草稿，恢复后重试成功并合并", () => {
  const s1 = makeShift("s1", "08-12班", "甲", 1000);
  writeDb({
    version: 1,
    shifts: [s1],
    params: [],
    inspections: [],
    conflicts: [],
    seeded: true,
  });

  const base: ParamReading = makeParam("p1", "s1", "82", "", "甲", 1000);
  // 先正常写入基线
  commitOps([{ kind: "upsert", entityType: "param", data: base, base: null, by: "甲", at: 1000 }]);

  // 数据库写入失败（草稿键仍可写）：提交应抛出，但草稿成功落盘
  mem.failKeys.add("marine-watch.db.v1");
  const edited: ParamReading = { ...base, value: "88", note: "晚班复测", updateAt: 5000, updateBy: "甲" };
  let threw = false;
  try {
    commitOps([{ kind: "upsert", entityType: "param", data: edited, base, by: "甲", at: 5000 }]);
  } catch {
    threw = true;
  }
  assert.ok(threw, "存储失败时提交抛错");

  // 草稿成功写入本地（与应用 enqueue 的行为一致：先存草稿再提交）
  writeDraft({
    savedAt: 5000,
    ops: [{ kind: "upsert", entityType: "param", data: edited, base, by: "甲", at: 5000 }],
  });

  // 存储恢复：重新打开页面，草稿仍在
  mem.failKeys.clear();
  const draft = readDraft();
  assert.equal(draft.ops.length, 1, "重开后草稿仍在");

  // 重试合并
  commitOps(draft.ops);
  const p = readDb().params.find((x) => x.id === "p1")!;
  assert.equal(p.value, "88");
  assert.equal(p.note, "晚班复测");
});

console.log(`\n${passed} 个测试全部通过`);
