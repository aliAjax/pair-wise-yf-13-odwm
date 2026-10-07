import { useState } from "react";
import "./styles.css";
import { StoreProvider, useStore } from "./lib/store";
import { DEVICES } from "./lib/helpers";
import DraftBanner from "./components/DraftBanner";
import ConflictPanel from "./components/ConflictPanel";
import ShiftBar from "./components/ShiftBar";
import MetricsBoard from "./components/MetricsBoard";
import RecordForm from "./components/RecordForm";
import InspectionTimeline from "./components/InspectionTimeline";
import HistoryList from "./components/HistoryList";

function HeroBar() {
  const { operator, setOperator, simulateFailure, setSimulateFailure, drafts, notice } = useStore();

  return (
    <section className="hero">
      <div className="hero-top">
        <div>
          <p>hxyfront-62001 · 船舶轮机值班记录</p>
          <h1>轮机值班记录台</h1>
        </div>
        <div className="hero-tools">
          <label className="operator-input">
            <span>操作者</span>
            <input value={operator} onChange={(event) => setOperator(event.target.value)} placeholder="值班轮机员姓名" />
          </label>
          <label className="sim-toggle">
            <input
              type="checkbox"
              checked={simulateFailure}
              onChange={(event) => setSimulateFailure(event.target.checked)}
            />
            <span>模拟存储写入失败</span>
          </label>
          <span className={`save-status ${drafts.length > 0 ? "has-draft" : ""}`}>
            {drafts.length > 0 ? `有 ${drafts.length} 项草稿待提交` : "已保存到本浏览器"}
          </span>
        </div>
      </div>
      <span>
        值班班次、机舱参数与异常巡检项均保存在浏览器本地（localStorage），刷新不丢失；设备历史按班次筛选。交接班后班次锁定，未处理异常自动带入新班次；多个标签页同时保存时按更新时间与操作者合并，冲突项单列确认；存储失败保留草稿，重试合并后继续。
      </span>
      {notice && <div className="notice-toast">{notice}</div>}
    </section>
  );
}

function Workspace() {
  const [deviceFilter, setDeviceFilter] = useState<string | null>(null);

  return (
    <>
      <MetricsBoard />
      <section className="workspace">
        <aside className="panel">
          <h2>设备筛选</h2>
          <div className="chips">
            <button className={deviceFilter === null ? "active" : ""} onClick={() => setDeviceFilter(null)}>
              全部
            </button>
            {DEVICES.map((device) => (
              <button
                key={device}
                className={deviceFilter === device ? "active" : ""}
                onClick={() => setDeviceFilter(device)}
              >
                {device}
              </button>
            ))}
          </div>
          <p className="filter-tip">筛选同时作用于异常巡检时间线与设备历史记录。</p>
        </aside>
        <RecordForm />
      </section>
      <InspectionTimeline deviceFilter={deviceFilter} />
      <HistoryList deviceFilter={deviceFilter} />
    </>
  );
}

function App() {
  return (
    <main className="app">
      <StoreProvider>
        <HeroBar />
        <DraftBanner />
        <ConflictPanel />
        <ShiftBar />
        <Workspace />
      </StoreProvider>
    </main>
  );
}

export default App;
