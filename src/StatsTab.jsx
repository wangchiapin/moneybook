import React, { useMemo } from "react";
import { GOOD, STAMP, PAPER_DEEP, twYear, fmt, computeMonthStats } from "./lib.js";
import { thStyle, tdStyle } from "./components.jsx";

export default function StatsTab({ expenses, incomes, categories, viewMonth, setViewMonth, setTab }) {
  const statsFor = (month) => computeMonthStats(expenses, incomes, categories, month);

  const allMonths = useMemo(() => {
    const set = new Set(expenses.map((e) => e.date.slice(0, 7)));
    incomes.forEach((i) => set.add(i.month));
    set.add(viewMonth);
    return Array.from(set).sort();
  }, [expenses, incomes, viewMonth]);

  const yearGroups = useMemo(() => {
    const byYear = {};
    allMonths.forEach((mk) => {
      const y = twYear(mk.split("-")[0]);
      (byYear[y] = byYear[y] || []).push(mk);
    });
    return Object.keys(byYear).sort((a, b) => a - b).map((y) => ({ year: y, months: byYear[y].sort() }));
  }, [allMonths]);

  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #ECE1C9", overflow: "hidden" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#8A8072", padding: "12px 14px 6px", letterSpacing: 1 }}>
        逐月統計（比照原 Excel「統計」表，點任一列可跳到該月記帳）
      </div>
      <div className="lg-scroll" style={{ overflowX: "auto", padding: "0 4px 12px" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 11.5, minWidth: 720 }}>
          <thead>
            <tr>
              <th style={thStyle}>月份</th>
              {categories.map((c) => (<th key={c.id} style={{ ...thStyle, color: c.color }}>{c.id}</th>))}
              <th style={thStyle}>總計</th>
              <th style={thStyle}>扣卡費</th>
              <th style={thStyle}>收入</th>
              <th style={thStyle}>收支損益</th>
            </tr>
          </thead>
          <tbody>
            {yearGroups.map((yg) => (
              <React.Fragment key={yg.year}>
                {yg.months.map((mk) => {
                  const s = statsFor(mk);
                  const active = mk === viewMonth;
                  return (
                    <tr key={mk} onClick={() => { setViewMonth(mk); setTab("ledger"); }} style={{ cursor: "pointer", background: active ? "#FBF3E4" : "transparent" }}>
                      <td style={{ ...tdStyle, fontWeight: 700, position: "sticky", left: 0, background: active ? "#FBF3E4" : "#fff" }}>{Number(mk.split("-")[1])}月</td>
                      {categories.map((c) => (<td key={c.id} style={tdStyle}>{s.categoryTotals[c.id] ? fmt(s.categoryTotals[c.id]) : "－"}</td>))}
                      <td style={{ ...tdStyle, fontWeight: 700 }}>{fmt(s.total)}</td>
                      <td style={tdStyle}>{fmt(s.netExpense)}</td>
                      <td style={{ ...tdStyle, color: GOOD }}>{s.incomeTotal ? fmt(s.incomeTotal) : "－"}</td>
                      <td style={{ ...tdStyle, fontWeight: 700, color: s.balance >= 0 ? GOOD : STAMP }}>{s.balance >= 0 ? "+" : ""}{fmt(s.balance)}</td>
                    </tr>
                  );
                })}
                <tr style={{ background: PAPER_DEEP }}>
                  <td style={{ ...tdStyle, fontWeight: 800, position: "sticky", left: 0, background: PAPER_DEEP }}>{yg.year}年</td>
                  {categories.map((c) => {
                    const sum = yg.months.reduce((s, mk) => s + statsFor(mk).categoryTotals[c.id], 0);
                    return <td key={c.id} style={{ ...tdStyle, fontWeight: 700 }}>{sum ? fmt(sum) : "－"}</td>;
                  })}
                  {(() => {
                    const totals = yg.months.reduce((acc, mk) => {
                      const s = statsFor(mk);
                      acc.total += s.total; acc.net += s.netExpense; acc.inc += s.incomeTotal; acc.bal += s.balance;
                      return acc;
                    }, { total: 0, net: 0, inc: 0, bal: 0 });
                    return (
                      <>
                        <td style={{ ...tdStyle, fontWeight: 800 }}>{fmt(totals.total)}</td>
                        <td style={{ ...tdStyle, fontWeight: 800 }}>{fmt(totals.net)}</td>
                        <td style={{ ...tdStyle, fontWeight: 800, color: GOOD }}>{fmt(totals.inc)}</td>
                        <td style={{ ...tdStyle, fontWeight: 800, color: totals.bal >= 0 ? GOOD : STAMP }}>{totals.bal >= 0 ? "+" : ""}{fmt(totals.bal)}</td>
                      </>
                    );
                  })()}
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
