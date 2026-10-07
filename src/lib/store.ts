import { useCallback, useEffect, useRef, useState } from "react";
import type { Database, DraftFile, PendingOp } from "../types";
import {
  StorageUnavailableError,
  clearDraft,
  commitOps,
  readDb,
  readDraft,
  subscribeStorage,
  writeDb,
  writeDraft,
} from "./storage";
import { seedDatabase } from "./constants";

const OPERATOR_KEY = "marine-watch.operator.v1";
const RETRY_INTERVAL = 8000;

function loadInitial(): { db: Database; draft: DraftFile; storageError: string | null } {
  let db: Database;
  let storageError: string | null = null;
  try {
    db = readDb();
    if (!db.seeded && db.shifts.length === 0) {
      db = seedDatabase();
      try {
        writeDb(db);
      } catch (err) {
        storageError =
          err instanceof StorageUnavailableError
            ? err.message
            : "本地数据写入失败，当前记录仅保存在本页面内存中。";
      }
    }
  } catch (err) {
    storageError =
      err instanceof StorageUnavailableError
        ? err.message
        : "本地存储读取失败，已载入临时数据。";
    db = seedDatabase();
  }

  let draft: DraftFile = { savedAt: 0, ops: [] };
  try {
    draft = readDraft();
  } catch {
    storageError = storageError ?? "本地草稿读取失败。";
  }
  return { db, draft, storageError };
}

export function useWatchStore() {
  const initial = useRef(loadInitial());
  const [db, setDb] = useState<Database>(initial.current.db);
  const [draft, setDraft] = useState<DraftFile>(initial.current.draft);
  const [storageError, setStorageError] = useState<string | null>(initial.current.storageError);
  const [toast, setToast] = useState<string | null>(null);

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const dbRef = useRef(db);
  dbRef.current = db;

  const refreshDb = useCallback(() => {
    try {
      setDb(readDb());
    } catch {
      /* 读失败时保留当前内存数据，等下次事件再试 */
    }
  }, []);

  const flush = useCallback((): boolean => {
    const ops = draftRef.current.ops;
    if (ops.length === 0) return true;
    try {
      commitOps(ops);
      try {
        clearDraft();
      } catch {
        /* 数据已提交；草稿清不掉不影响结果，下次启动会幂等重放 */
      }
      setDraft({ savedAt: 0, ops: [] });
      setStorageError(null);
      refreshDb();
      return true;
    } catch (err) {
      setStorageError(
        err instanceof StorageUnavailableError
          ? "本地存储暂不可用，改动已保留为待提交草稿，将自动重试。"
          : "提交失败，改动已保留为待提交草稿，将自动重试。"
      );
      return false;
    }
  }, [refreshDb]);

  // 入队一条操作：先持久化草稿（保证关掉重开还能继续），再立即尝试提交
  const enqueue = useCallback(
    (op: PendingOp): { queued: boolean; committed: boolean } => {
      const next: DraftFile = { savedAt: Date.now(), ops: [...draftRef.current.ops, op] };
      let persisted = true;
      try {
        writeDraft(next);
      } catch {
        persisted = false;
        setStorageError("本地存储暂不可用，草稿暂存在本页面内存中，请不要关闭页面。");
      }
      setDraft(next);
      draftRef.current = next;

      const committed = flush();
      if (!committed && persisted) {
        setStorageError("本地存储暂不可用，改动已保留为待提交草稿，将自动重试。");
      }
      return { queued: true, committed };
    },
    [flush]
  );

  // 跨标签页：其它页面写入后，本页重新载入数据与草稿
  useEffect(() => {
    return subscribeStorage(() => {
      refreshDb();
      try {
        setDraft(readDraft());
      } catch {
        /* ignore */
      }
      // 存储恢复可用（另一个标签页可能触发了授权等）时顺手重试
      flush();
    });
  }, [refreshDb, flush]);

  // 自动重试：定时 / 页面重新可见 / 网络或浏览器状态恢复
  useEffect(() => {
    const timer = window.setInterval(flush, RETRY_INTERVAL);
    const onVisible = () => {
      if (document.visibilityState === "visible") flush();
    };
    const onFocus = () => flush();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
    };
  }, [flush]);

  const retry = useCallback(() => {
    const ok = flush();
    setToast(ok ? "草稿已提交并合并。" : "仍无法写入本地存储，将继续重试。");
    window.setTimeout(() => setToast(null), 2600);
  }, [flush]);

  return {
    db,
    draftCount: draft.ops.length,
    draftSavedAt: draft.savedAt,
    storageError,
    toast,
    enqueue,
    retry,
    refreshDb,
  };
}

export function loadOperator(): string {
  try {
    return window.localStorage.getItem(OPERATOR_KEY) || "";
  } catch {
    return "";
  }
}

export function saveOperator(name: string): void {
  try {
    window.localStorage.setItem(OPERATOR_KEY, name);
  } catch {
    /* 操作者只影响署名，失败不阻塞录入 */
  }
}
