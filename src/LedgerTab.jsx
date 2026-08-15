import React, { useMemo } from "react";
import { Trash2, PiggyBank, Pencil, Check } from "lucide-react";
import { INK, GOOD, STAMP, INCOME_SOURCES, fmt, dateLabel, monthKeyOf } from "./lib.js";
import { CatDot, Tile } from "./components.jsx";

export default function LedgerTab({
  expenses, incomes, categories, catMap, monthStats, viewMonth,
  confirmDeleteId, setConfirmDeleteId, deleteExpense,
  editingIncomeSrc, setEditingIncomeSrc, incomeDraft, setIncomeDraft,
  getIncomeAmount, saveIncome,
}) {
  const monthGroups = useMemo(() => {
    const monthExp = expenses.filter((e) => monthKeyOf(e.date) === viewMonth);
    const byDate = {};
    monthExp.forEach((e) => { (byDate[e.date] = byDate[e.date] || []).push(e); });
    const dates = Object.keys(byDate).sort().reverse();
    return dates.map((d) => ({
      date: d,
      items: byDate[d].sort((a, b) => b.id.localeCompare(a.id)),
      subtotal: byDate[d].reduce((s, e) => s + Number(e.price || 0), 0),
    }));
  }, [expenses, viewMonth]);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
        <Tile label="支出總計" value={monthStats.total} color={INK} />
        <Tile label="扣卡費" value={monthStats.netExpense} color={INK} />
        <Tile label="收入合計" value={monthStats.incomeTotal} color={GOOD} />
      </div>

      <div className="lg-scroll" style={{ marginBottom: 18, maxHeight: 440, overflowY: "auto", paddingRight: 4 }}>
        {monthGroups.length === 0 && (
          <div style={{ textAlign: "center", padding: "36px 0", color: "#A79C89", fontSize: 13 }}>
            本月尚無紀錄，點右下角「＋」開始記帳
          </div>
        )}
        {monthGroups.map((g) => (
          <div key={g.date} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 2px 6px", borderBottom: `1px solid #E0D5BC` }}>
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Noto Serif TC', serif" }}>{dateLabel(g.date)}</span>
              <span style={{ fontSize: 12, color: "#8A8072", fontFamily: "'JetBrains Mono', monospace" }}>小計 ${fmt(g.subtotal)}</span>
            </div>
            {g.items.map((it) => {
              const cat = catMap[it.category] || { name: it.category, color: "#999" };
              const confirming = confirmDeleteId === it.id;
              return (
                <div
                  key={it.id}
                  onClick={() => setConfirmDeleteId(confirming ? null : it.id)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 2px", borderBottom: "1px solid #EFE7D4", cursor: "pointer" }}
                >
                  <CatDot color={cat.color} size={9} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.item || cat.name}</div>
                    <div style={{ fontSize: 11, color: "#A79C89" }}>{cat.name}{it.note ? ` · ${it.note}` : ""}</div>
                  </div>
                  {confirming ? (
                    <button onClick={(e) => { e.stopPropagation(); deleteExpense(it.id); }}
                      style={{ background: STAMP, color: "#fff", border: "none", borderRadius: 8, padding: "6px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                      <Trash2 size={13} /> 刪除
                    </button>
                  ) : (
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 600 }}>${fmt(it.price)}</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", borderRadius: 16, padding: 14, marginBottom: 14, border: "1px solid #ECE1C9" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#8A8072", marginBottom: 10, letterSpacing: 1 }}>分類明細</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 14px" }}>
          {categories.map((c) => (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#5C5343" }}>
                <CatDot color={c.color} /> {c.name}
              </span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", color: monthStats.categoryTotals[c.id] ? INK : "#C9BFA9" }}>
                {fmt(monthStats.categoryTotals[c.id])}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 16, padding: 14, border: "1px solid #ECE1C9" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#8A8072", marginBottom: 10, letterSpacing: 1 }}>
          <PiggyBank size={14} /> 本月收入
        </div>
        {INCOME_SOURCES.map((src) => {
          const amount = getIncomeAmount(viewMonth, src);
          const editing = editingIncomeSrc === src;
          return (
            <div key={src} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", fontSize: 13, borderBottom: "1px solid #F3ECDA" }}>
              <span style={{ color: "#5C5343" }}>{src}</span>
              {editing ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="number" autoFocus defaultValue={amount || ""}
                    onChange={(e) => setIncomeDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveIncome(viewMonth, src, Number(incomeDraft || 0)); }}
                    style={{ width: 90, border: "1px solid #D8CBAE", borderRadius: 8, padding: "4px 8px", fontSize: 13, textAlign: "right", fontFamily: "'JetBrains Mono', monospace" }}
                  />
                  <button onClick={() => saveIncome(viewMonth, src, Number(incomeDraft || 0))} style={{ background: GOOD, border: "none", color: "#fff", borderRadius: 6, padding: 5, cursor: "pointer" }}>
                    <Check size={13} />
                  </button>
                </div>
              ) : (
                <button onClick={() => { setEditingIncomeSrc(src); setIncomeDraft(String(amount || "")); }}
                  style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: INK, fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>
                  ${fmt(amount)} <Pencil size={11} color="#B8AC91" />
                </button>
              )}
            </div>
          );
        })}
        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, fontSize: 13, fontWeight: 700 }}>
          <span>共計</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", color: GOOD }}>${fmt(monthStats.incomeTotal)}</span>
        </div>
      </div>
    </div>
  );
}
