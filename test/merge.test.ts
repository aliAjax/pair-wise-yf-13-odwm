// 冒烟测试：多标签页合并逻辑（参数读数/异常处置互不覆盖、冲突单列）
import { mergeState, applyDrafts } from "../src/lib/merge";
import type { Inspection, Reading, Shift, StoredData } from "../src/lib/types";

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error("FAIL:", msg);
  }
}

const shift: Shift = {
  id: "s1",
  name: "08-12班",
  startAt: 1,
  endAt: null,
  status: "active",
  handoverNote: "",
  createdAt: 1,
  updatedAt: 1,
  updatedBy: "甲",
};

// 场景1：两个标签页各自追加不同读数 → 两条都保留，不冲突
const r1: Reading = {
  id: "r1", shiftId: "s1", device: "主机", metric: "主机转速", value: 82, unit: "rpm",
  recordedAt: 2, createdAt: 2, updatedAt: 2, updatedBy: "甲",
};
const r2: Reading = {
  id: "r2", shiftId: "s1", device: "发电机", metric: "滑油压力", value: 0.42, unit: "MPa",
  recordedAt: 3, createdAt: 3, updatedAt: 3, updatedBy: "乙",
};
const local1: StoredData = { shifts: [shift], readings: [r1], inspections: [] };
const remote1: StoredData = { shifts: [shift], readings: [r2], inspections: [] };
const res1 = mergeState(local1, remote1);
assert(res1.readings.length === 2, "不同读数应同时保留");
assert(res1.conflicts.length === 0, "不同读数不应产生冲突");

// 场景2：两个标签页修改同一条读数，更新时间不同 → 新者胜
const r1Newer: Reading = { ...r1, value: 90, updatedAt: 5, updatedBy: "乙" };
const res2 = mergeState(local1, { shifts: [shift], readings: [r1Newer], inspections: [] });
assert(res2.readings[0].value === 90, "同读数更新时间不同应取新者");
assert(res2.conflicts.length === 0, "时间可判定时不应冲突");

// 场景3：同一条读数同更新时间但内容不同 → 冲突单列
const r1Conflict: Reading = { ...r1, value: 88, updatedBy: "乙" };
const res3 = mergeState(local1, { shifts: [shift], readings: [r1Conflict], inspections: [] });
assert(res3.conflicts.length === 1 && res3.conflicts[0].kind === "reading", "同时间同记录内容不同应单列冲突");

// 场景4：异常处置互不覆盖：处理记录取并集
const insp: Inspection = {
  id: "i1", shiftId: "s1", device: "主机", description: "冷却水温偏高",
  handlings: [{ id: "h1", at: 2, by: "甲", action: "open", note: "巡检发现异常" }],
  createdAt: 2, createdBy: "甲", updatedAt: 2, updatedBy: "甲",
};
const inspRemote: Inspection = {
  ...insp,
  handlings: [
    { id: "h1", at: 2, by: "甲", action: "open", note: "巡检发现异常" },
    { id: "h2", at: 4, by: "乙", action: "handling", note: "已安排复查" },
  ],
  updatedAt: 4,
  updatedBy: "乙",
};
const res4 = mergeState(
  { shifts: [shift], readings: [], inspections: [insp] },
  { shifts: [shift], readings: [], inspections: [inspRemote] },
);
assert(res4.inspections[0].handlings.length === 2, "异常处置记录应取并集");
assert(res4.inspections[0].handlings[1].action === "handling", "处置状态应保留");
assert(res4.conflicts.length === 0, "处置追加不应产生冲突");

// 场景5：草稿合并：草稿记录更新，正常并入
const draftData: StoredData = { shifts: [shift], readings: [{ ...r1, value: 95, updatedAt: 9, updatedBy: "甲" }], inspections: [] };
const res5 = applyDrafts(local1, [{ id: "d1", createdAt: 9, description: "草稿", ...draftData }]);
assert(res5.readings[0].value === 95, "草稿应并入目标状态");

// 场景6：班次锁定状态合并
const handed: Shift = { ...shift, status: "handed", endAt: 10, handoverNote: "交接正常", updatedAt: 10, updatedBy: "甲" };
const res6 = mergeState({ shifts: [shift], readings: [], inspections: [] }, { shifts: [handed], readings: [], inspections: [] });
assert(res6.shifts[0].status === "handed", "班次交接状态应合并");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
