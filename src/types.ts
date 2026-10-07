// 值班记录领域模型
// 数据仅保存在浏览器本地（localStorage），结构上预留后续接入服务端的可能。

export type ShiftStatus = "active" | "locked";

export interface Shift {
  id: string;
  /** 班次名称，如 08-12班 */
  name: string;
  status: ShiftStatus;
  /** 本班值班轮机员 */
  operator: string;
  startedAt: number;
  endedAt: number | null;
  /** 接班人 */
  handoverTo: string | null;
  /** 交接备注 */
  handoverSummary: string;
  createdAt: number;
  createdBy: string;
  updateAt: number;
  updateBy: string;
}

export type MetricKey =
  | "rpm"
  | "lubeOilPressure"
  | "coolingTemp"
  | "fuelConsumption"
  | "bilgeStatus";

export interface MetricMeta {
  key: MetricKey;
  label: string;
  unit: string;
  /** 候选用语（如舱底水状态） */
  options?: string[];
}

export interface ParamReading {
  id: string;
  shiftId: string;
  /** 所属设备：主机 / 发电机#2 / 泵组 / 舱底水 …… */
  equipment: string;
  metricKey: MetricKey;
  /** 参数读数（舱底水状态等文本量也以字符串保存） */
  value: string;
  note: string;
  recordedAt: number;
  recordedBy: string;
  updateAt: number;
  updateBy: string;
}

export type InspectionStatus = "open" | "inprogress" | "resolved";

export interface Inspection {
  id: string;
  /** 登记该异常的原始班次 */
  shiftId: string;
  /** 交接时被带入的后续班次 id 链（最新在末尾） */
  carriedInto: string[];
  equipment: string;
  title: string;
  description: string;
  status: InspectionStatus;
  /** 异常处置措施 */
  handling: string;
  handler: string;
  resolvedAt: number | null;
  createdAt: number;
  createdBy: string;
  updateAt: number;
  updateBy: string;
}

export type EntityType = "shift" | "param" | "inspection";

/** 同一字段在两个标签页被改成不同值时产生的冲突记录 */
export interface FieldConflict {
  /** 确定性 id：实体类型:实体id:字段 */
  id: string;
  entityType: EntityType;
  entityId: string;
  field: string;
  baseValue: string;
  localValue: string;
  remoteValue: string;
  localBy: string;
  localAt: number;
  remoteBy: string;
  remoteAt: number;
  /** 合并时按更新时间暂定胜出的一方 */
  tentativeWinner: "local" | "remote";
  createdAt: number;
}

export interface Database {
  version: 1;
  shifts: Shift[];
  params: ParamReading[];
  inspections: Inspection[];
  conflicts: FieldConflict[];
  seeded: boolean;
}

/** 待提交操作（本地草稿队列元素）。所有跨标签页合并都在提交时基于三方合并完成。 */
export type PendingOp =
  | {
      kind: "upsert";
      entityType: EntityType;
      /** 编辑后的完整实体 */
      data: Shift | ParamReading | Inspection;
      /** 编辑开始时的基线实体；新建为 null */
      base: Shift | ParamReading | Inspection | null;
      by: string;
      at: number;
    }
  | {
      kind: "handover";
      oldShift: Shift;
      newShift: Shift;
      carryIds: string[];
      base: {
        shifts: Record<string, Shift>;
        inspections: Record<string, Inspection>;
      };
      by: string;
      at: number;
    }
  | {
      kind: "resolve";
      conflictId: string;
      entityType: EntityType;
      entityId: string;
      field: string;
      /** 选择采用的值（已序列化） */
      value: string;
      by: string;
      at: number;
    };

export interface DraftFile {
  savedAt: number;
  ops: PendingOp[];
}
