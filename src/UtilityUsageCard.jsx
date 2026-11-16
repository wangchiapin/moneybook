import React, { useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Trash2 } from "lucide-react";
import { STAMP } from "./lib.js";
import { KIND_LABEL, groupReadings, removeReading, shortLabel } from "./utilityReadings.js";

const COLORS = { water: "#4A6FA5", electric: "#C79A2A" };

// 圖表頁最下面的「水電使用」：每種（水、電）一張圖、平均、明細
export default function UtilityUsageCard({ utilityReadings, setUtilityReadingsPersist }) {
  const groups = groupReadings(utilityReadings);
  if (!groups.length) {
    return (
      <div style={{ background: "#fff", borderRadius: 16, padding: 14, border: "1px solid #ECE1C9" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#8A8072", letterSpacing: 1, marginBottom: 10 }}>水電使用</div>
        <div style={{ textAlign: "center", padding: "24px 0", color: "#A79C89", fontSize: 13 }}>
          還沒有資料。到「設定 → 備份與匯入 → 匯入帳單證明」匯入水費收據，這裡就會出現度數圖。
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {groups.map((g) => (
        <KindBlock key={g.key} kind={g.kind} list={g.list}
          title={g.label || (groups.filter((x) => x.kind === g.kind).length > 1 && g.meterNo ? `表號 ${g.meterNo}` : "")}
          onDelete={(id) => setUtilityReadingsPersist(removeReading(utilityReadings, id))} />
      ))}
    </div>
  );
}

function KindBlock({ kind, list, title, onDelete }) {
  const [confirmId, setConfirmId] = useState(null);
  const [showList, setShowList] = useState(false);
  const color = COLORS[kind];
  const data = useMemo(() => list.map((r) => ({
    name: shortLabel(r.periodStart, r.periodEnd), 度數: r.usage, ref: r.source === "ref", id: r.id,
  })), [list]);
  const avg = list.length ? Math.round((list.reduce((s, r) => s + r.usage, 0) / list.length) * 10) / 10 : 0;
  const latest = list[list.length - 1];
  const hasRef = list.some((r) => r.source === "ref");

  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: 14, border: "1px solid #ECE1C9" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#8A8072", letterSpacing: 1 }}>{KIND_LABEL[kind]}使用度數（每期）{title ? `・${title}` : ""}</div>
        <div style={{ fontSize: 12, color: "#5C5343" }}>平均每期 <b>{avg}</b> 度</div>
      </div>
      <div style={{ fontSize: 11.5, color: "#A79C89", marginBottom: 8 }}>
        共 {list.length} 期；最近一期 {shortLabel(latest.periodStart, latest.periodEnd)}：{latest.usage} 度
        {hasRef ? "。淺色是從別期帳單上讀到的「上期、去年同期」參考值" : ""}
      </div>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#EFE7D4" />
            <XAxis dataKey="name" tick={{ fontSize: 9.5, fill: "#8A8072" }} axisLine={false} tickLine={false}
              interval={Math.max(0, Math.ceil(data.length / 6) - 1)} />
            <YAxis tick={{ fontSize: 10, fill: "#8A8072" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #ECE1C9" }} formatter={(v) => `${v} 度`} />
            <Bar dataKey="度數" radius={[4, 4, 0, 0]}>
              {data.map((d) => <Cell key={d.id} fill={color} fillOpacity={d.ref ? 0.4 : 1} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <button onClick={() => setShowList(!showList)}
        style={{ background: "none", border: "none", color: "#8A8072", fontSize: 12, textDecoration: "underline", cursor: "pointer", marginTop: 6, padding: 0 }}>
        {showList ? "收起明細" : "看明細、刪除錯的紀錄"}
      </button>
      {showList && (
        <div style={{ marginTop: 8 }}>
          {[...list].reverse().map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid #F3ECDA", fontSize: 12.5 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#3A342A" }}>{shortLabel(r.periodStart, r.periodEnd)}　{r.usage} 度{r.dailyAvg != null ? `（日平均 ${r.dailyAvg}）` : ""}</div>
                <div style={{ fontSize: 11, color: "#A79C89" }}>
                  {r.periodStart} ～ {r.periodEnd}　{r.source === "ref" ? "參考值" : "本期帳單"}{r.meterNo ? `　表號 ${r.meterNo}` : ""}
                </div>
              </div>
              {confirmId === r.id ? (
                <button onClick={() => { onDelete(r.id); setConfirmId(null); }}
                  style={{ background: STAMP, color: "#fff", border: "none", borderRadius: 6, padding: "4px 6px", fontSize: 11, display: "flex", alignItems: "center", gap: 3, cursor: "pointer" }}>
                  <Trash2 size={12} /> 確定
                </button>
              ) : (
                <button onClick={() => setConfirmId(r.id)} aria-label="刪除"
                  style={{ background: "none", border: "none", color: "#D8CBAE", cursor: "pointer", padding: 4 }}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
